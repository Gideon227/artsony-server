import { getBlockchainAdapter } from '../adapters/blockchain.adapter'
import { orderRepository } from '@/modules/order/repositories/order.repository'
import { orderService } from '@/modules/order/services/order.service'
import { redisGetJson, redisSetJson, redisSet, redisDel, RedisKeys, RedisTTL } from '@/modules/redis/redis.client'
import { AppError } from '@/common/errors'
import type {
  Transaction,
  TransactionStatus,
  WalletNetwork,
  PaymentInstructions,
} from '@/common/types/commerce.types'
import { TRANSACTION_TRANSITIONS } from '@/common/types/commerce.types'
import { supabase, assertNoError } from '@/config/database'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_RETRY_COUNT     = 5
const RETRY_BACKOFF_MS    = [30_000, 60_000, 120_000, 300_000, 600_000] as const

// ── State machine guard ───────────────────────────────────────────────────────

function assertTxTransition(current: TransactionStatus, next: TransactionStatus): void {
  const allowed = TRANSACTION_TRANSITIONS[current]
  if (!allowed.includes(next)) {
    throw new AppError(
      `Cannot transition transaction from ${current} to ${next}`,
      422,
      'INVALID_TX_TRANSITION',
    )
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export const paymentService = {

  // ── getPaymentStatus ───────────────────────────────────────────────────────
  // Returns the current transaction for an order. Light cache on this
  // since buyers poll it while waiting for confirmation.

  async getPaymentStatus(orderId: string, requesterId: string): Promise<{
    transaction:          Transaction
    payment_instructions: PaymentInstructions
  }> {
    const cached = await redisGetJson<{ transaction: Transaction; payment_instructions: PaymentInstructions }>(
      RedisKeys.paymentStatus(orderId),
    )
    if (cached) return cached

    const order = await orderRepository.findById(orderId)
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND')

    const isBuyer  = order.buyer_id === requesterId
    const isSeller = order.items.some(i => i.seller_id === requesterId)
    if (!isBuyer && !isSeller) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN')
    }

    const tx = await orderRepository.findTransactionByOrder(orderId)
    if (!tx) throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND')

    const result = {
      transaction: tx,
      payment_instructions: {
        transaction_id:           tx.id,
        recipient_wallet_address: tx.recipient_wallet_address,
        amount:                   tx.amount,
        currency:                 tx.currency,
        network:                  tx.network,
        expires_at:               tx.expires_at,
      },
    }

    void redisSetJson(RedisKeys.paymentStatus(orderId), result, RedisTTL.paymentStatus)
    return result
  },

  // ── verifyTransaction ──────────────────────────────────────────────────────
  // Core verification method. Called by the background job after a buyer
  // submits a tx_hash. Uses a distributed lock to prevent concurrent
  // verification of the same transaction.

  async verifyTransaction(transactionId: string): Promise<void> {
    const lockKey      = RedisKeys.verifyLock(transactionId)
    const existingLock = await redisGetJson<string>(lockKey)
    if (existingLock) return

    await redisSet(lockKey, '1', RedisTTL.verifyLock)

    try {
      const tx = await orderRepository.findTransactionByOrder(
        await this._getOrderIdForTransaction(transactionId),
      )

      if (!tx || tx.id !== transactionId) return
      if (tx.status !== 'CONFIRMING') return
      if (!tx.tx_hash) return

      if (new Date() > tx.expires_at) {
        await this._expireTransaction(tx)
        return
      }

      if (tx.retry_count >= MAX_RETRY_COUNT) {
        await orderRepository.updateTransaction(transactionId, { status: 'FAILED' })
        return
      }

      const adapter = getBlockchainAdapter(tx.network)
      const result  = await adapter.verifyTransaction(
        tx.tx_hash,
        tx.amount,
        tx.recipient_wallet_address,
      )

      if (result.confirmed) {
        await orderService.fulfillOrder(tx.order_id, result.block)
        void redisDel(RedisKeys.paymentStatus(tx.order_id))
        return
      }

      switch (result.reason) {
        case 'PENDING':
        case 'NOT_FOUND':
          await orderRepository.updateTransaction(transactionId, {
            retry_count:   tx.retry_count + 1,
            last_retry_at: new Date(),
          })
          return

        case 'WRONG_RECIPIENT':
        case 'WRONG_AMOUNT':
          assertTxTransition(tx.status, 'FAILED')
          await orderRepository.updateTransaction(transactionId, { status: 'FAILED' })
          void redisDel(RedisKeys.paymentStatus(tx.order_id))
          return

        case 'FAILED':
          await orderRepository.updateTransaction(transactionId, { status: 'FAILED' })
          void redisDel(RedisKeys.paymentStatus(tx.order_id))
          return
      }
    } finally {
      await redisDel(lockKey)
    }
  },

  // ── getRetryDelayMs ───────────────────────────────────────────────────────
  // Exponential backoff schedule for the verification job scheduler.
  // Returns how many ms to wait before the next verification attempt.

  getRetryDelayMs(retryCount: number): number {
    const index = Math.min(retryCount, RETRY_BACKOFF_MS.length - 1)
    return RETRY_BACKOFF_MS[index]!
  },

  // ── _expireTransaction ────────────────────────────────────────────────────

  async _expireTransaction(tx: Transaction): Promise<void> {
    if (tx.status === 'PENDING' || tx.status === 'CONFIRMING') {
      assertTxTransition(tx.status, 'EXPIRED')
      await orderRepository.updateTransaction(tx.id, { status: 'EXPIRED' })
      void redisDel(RedisKeys.paymentStatus(tx.order_id))
    }
  },

  // ── _getOrderIdForTransaction ─────────────────────────────────────────────
  // Helper: resolves order_id from transaction_id using the transactions table
  // directly — avoids loading the full order just to get the ID.

  async _getOrderIdForTransaction(transactionId: string): Promise<string> {
    // const { supabase, assertNoError } = await import('@/config/database')
    const result = await (supabase() as any)
      .from('transactions')
      .select('order_id')
      .eq('id', transactionId)
      .single()

    assertNoError(result, 'payment._getOrderIdForTransaction')
    return result.data['order_id'] as string
  },
}