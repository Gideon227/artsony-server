"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleVerification = scheduleVerification;
exports.startExpireScheduler = startExpireScheduler;
const bull_1 = __importDefault(require("bull"));
const config_1 = require("../../../config");
const payment_service_1 = require("../services/payment.service");
const order_service_1 = require("../../../modules/order/services/order.service");
const database_1 = require("../../../config/database");
// ── Queues ────────────────────────────────────────────────────────────────────
const verifyQueue = new bull_1.default('artsony:queue:payment:verify', {
    redis: config_1.config.redis.url,
    defaultJobOptions: {
        attempts: 1, // payment service owns retry logic explicitly
        removeOnComplete: true,
        removeOnFail: false,
    },
});
const expireQueue = new bull_1.default('artsony:queue:payment:expire', {
    redis: config_1.config.redis.url,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: false,
    },
});
// ── Processors ────────────────────────────────────────────────────────────────
verifyQueue.process(async (job) => {
    const { transaction_id, retry_count } = job.data;
    await payment_service_1.paymentService.verifyTransaction(transaction_id);
    // Re-fetch transaction to check if it still needs retrying
    const result = await (0, database_1.supabase)()
        .from('transactions')
        .select('status, retry_count')
        .eq('id', transaction_id)
        .single();
    if (result.error || !result.data)
        return;
    const status = result.data['status'];
    const nextRetry = result.data['retry_count'];
    // If still CONFIRMING and retries remain — schedule next check with backoff
    if (status === 'CONFIRMING' && nextRetry < 5) {
        const delay = payment_service_1.paymentService.getRetryDelayMs(nextRetry);
        await scheduleVerification(transaction_id, nextRetry, delay);
    }
});
expireQueue.process(async () => {
    await order_service_1.orderService.expireStaleOrders();
});
// ── Error handlers ────────────────────────────────────────────────────────────
verifyQueue.on('failed', (job, err) => {
    console.error(`[PaymentVerifyQueue] Job ${job.id} failed for tx ${job.data.transaction_id}:`, err.message);
});
expireQueue.on('failed', (job, err) => {
    console.error(`[PaymentExpireQueue] Job ${job.id} failed:`, err.message);
});
// ── Public scheduling helpers ─────────────────────────────────────────────────
/**
 * Enqueues a verification job for a transaction.
 * Called by the order service after a buyer submits a tx_hash.
 * delay defaults to the first backoff slot (30s) for the initial check.
 */
async function scheduleVerification(transactionId, retryCount = 0, delayMs = 30_000) {
    await verifyQueue.add({ transaction_id: transactionId, retry_count: retryCount }, { delay: delayMs, jobId: `verify:${transactionId}:${retryCount}` });
}
/**
 * Starts the recurring expiry job. Called once at app startup.
 * Runs every 5 minutes — finds PENDING/CONFIRMING transactions past
 * expires_at, cancels their orders, and releases stock.
 */
async function startExpireScheduler() {
    // Remove any existing repeat job to avoid duplicates on restart
    const existing = await expireQueue.getRepeatableJobs();
    for (const job of existing) {
        await expireQueue.removeRepeatableByKey(job.key);
    }
    await expireQueue.add({}, { repeat: { every: 5 * 60 * 1000 }, jobId: 'expire:recurring' });
    console.log('[PaymentExpireQueue] Recurring expiry job registered (every 5 min)');
}
//# sourceMappingURL=payment.job.js.map