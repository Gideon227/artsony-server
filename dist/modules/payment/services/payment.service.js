"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentService = void 0;
const blockchain_adapter_1 = require("../adapters/blockchain.adapter");
const order_repository_1 = require("../../../modules/order/repositories/order.repository");
const order_service_1 = require("../../../modules/order/services/order.service");
const redis_client_1 = require("../../../modules/redis/redis.client");
const errors_1 = require("../../../common/errors");
const commerce_types_1 = require("../../../common/types/commerce.types");
const database_1 = require("../../../config/database");
// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_RETRY_COUNT = 5;
const RETRY_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000];
// ── State machine guard ───────────────────────────────────────────────────────
function assertTxTransition(current, next) {
    const allowed = commerce_types_1.TRANSACTION_TRANSITIONS[current];
    if (!allowed.includes(next)) {
        throw new errors_1.AppError(`Cannot transition transaction from ${current} to ${next}`, 422, 'INVALID_TX_TRANSITION');
    }
}
// ── Service ───────────────────────────────────────────────────────────────────
exports.paymentService = {
    // ── getPaymentStatus ───────────────────────────────────────────────────────
    // Returns the current transaction for an order. Light cache on this
    // since buyers poll it while waiting for confirmation.
    async getPaymentStatus(orderId, requesterId) {
        const cached = await (0, redis_client_1.redisGetJson)(redis_client_1.RedisKeys.paymentStatus(orderId));
        if (cached)
            return cached;
        const order = await order_repository_1.orderRepository.findById(orderId);
        if (!order)
            throw new errors_1.AppError('Order not found', 404, 'ORDER_NOT_FOUND');
        const isBuyer = order.buyer_id === requesterId;
        const isSeller = order.items.some(i => i.seller_id === requesterId);
        if (!isBuyer && !isSeller) {
            throw new errors_1.AppError('Forbidden', 403, 'FORBIDDEN');
        }
        const tx = await order_repository_1.orderRepository.findTransactionByOrder(orderId);
        if (!tx)
            throw new errors_1.AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
        const result = {
            transaction: tx,
            payment_instructions: {
                transaction_id: tx.id,
                recipient_wallet_address: tx.recipient_wallet_address,
                amount: tx.amount,
                currency: tx.currency,
                network: tx.network,
                expires_at: tx.expires_at,
            },
        };
        void (0, redis_client_1.redisSetJson)(redis_client_1.RedisKeys.paymentStatus(orderId), result, redis_client_1.RedisTTL.paymentStatus);
        return result;
    },
    // ── verifyTransaction ──────────────────────────────────────────────────────
    // Core verification method. Called by the background job after a buyer
    // submits a tx_hash. Uses a distributed lock to prevent concurrent
    // verification of the same transaction.
    async verifyTransaction(transactionId) {
        const lockKey = redis_client_1.RedisKeys.verifyLock(transactionId);
        const existingLock = await (0, redis_client_1.redisGetJson)(lockKey);
        if (existingLock)
            return;
        await (0, redis_client_1.redisSet)(lockKey, '1', redis_client_1.RedisTTL.verifyLock);
        try {
            const tx = await order_repository_1.orderRepository.findTransactionByOrder(await this._getOrderIdForTransaction(transactionId));
            if (!tx || tx.id !== transactionId)
                return;
            if (tx.status !== 'CONFIRMING')
                return;
            if (!tx.tx_hash)
                return;
            if (new Date() > tx.expires_at) {
                await this._expireTransaction(tx);
                return;
            }
            if (tx.retry_count >= MAX_RETRY_COUNT) {
                await order_repository_1.orderRepository.updateTransaction(transactionId, { status: 'FAILED' });
                return;
            }
            const adapter = (0, blockchain_adapter_1.getBlockchainAdapter)(tx.network);
            const result = await adapter.verifyTransaction(tx.tx_hash, tx.amount, tx.recipient_wallet_address);
            if (result.confirmed) {
                await order_service_1.orderService.fulfillOrder(tx.order_id, result.block);
                void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.paymentStatus(tx.order_id));
                return;
            }
            switch (result.reason) {
                case 'PENDING':
                case 'NOT_FOUND':
                // RETRYABLE = the explorer API itself failed (timeout, rate limit,
                // non-2xx, network error) — this says nothing about the on-chain
                // outcome, so it must not be treated the same as a genuine payment
                // failure. Retry under the same backoff as PENDING/NOT_FOUND.
                case 'RETRYABLE':
                    await order_repository_1.orderRepository.updateTransaction(transactionId, {
                        retry_count: tx.retry_count + 1,
                        last_retry_at: new Date(),
                    });
                    return;
                case 'WRONG_RECIPIENT':
                case 'WRONG_AMOUNT':
                    assertTxTransition(tx.status, 'FAILED');
                    await order_repository_1.orderRepository.updateTransaction(transactionId, { status: 'FAILED' });
                    void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.paymentStatus(tx.order_id));
                    return;
                case 'FAILED':
                    await order_repository_1.orderRepository.updateTransaction(transactionId, { status: 'FAILED' });
                    void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.paymentStatus(tx.order_id));
                    return;
            }
        }
        finally {
            await (0, redis_client_1.redisDel)(lockKey);
        }
    },
    // ── getRetryDelayMs ───────────────────────────────────────────────────────
    // Exponential backoff schedule for the verification job scheduler.
    // Returns how many ms to wait before the next verification attempt.
    getRetryDelayMs(retryCount) {
        const index = Math.min(retryCount, RETRY_BACKOFF_MS.length - 1);
        return RETRY_BACKOFF_MS[index];
    },
    // ── _expireTransaction ────────────────────────────────────────────────────
    async _expireTransaction(tx) {
        if (tx.status === 'PENDING' || tx.status === 'CONFIRMING') {
            assertTxTransition(tx.status, 'EXPIRED');
            await order_repository_1.orderRepository.updateTransaction(tx.id, { status: 'EXPIRED' });
            void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.paymentStatus(tx.order_id));
        }
    },
    // ── _getOrderIdForTransaction ─────────────────────────────────────────────
    // Helper: resolves order_id from transaction_id using the transactions table
    // directly — avoids loading the full order just to get the ID.
    async _getOrderIdForTransaction(transactionId) {
        // const { supabase, assertNoError } = await import('../../../config/database')
        const result = await (0, database_1.supabase)()
            .from('transactions')
            .select('order_id')
            .eq('id', transactionId)
            .single();
        (0, database_1.assertNoError)(result, 'payment._getOrderIdForTransaction');
        return result.data['order_id'];
    },
};
//# sourceMappingURL=payment.service.js.map