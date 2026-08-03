import Bull from 'bull'
import { config } from '@/config'
import { paymentService } from '../services/payment.service'
import { orderService } from '@/modules/order/services/order.service'
import { supabase } from '@/config/database'

// ── Job type definitions ──────────────────────────────────────────────────────

type VerifyJobData = {
  transaction_id: string
  retry_count:    number
}

type ExpireJobData = Record<string, never>

// ── Queues ────────────────────────────────────────────────────────────────────

const verifyQueue = new Bull<VerifyJobData>('artsony:queue:payment:verify', {
  redis: config.redis.url,
  defaultJobOptions: {
    attempts:         1,         // payment service owns retry logic explicitly
    removeOnComplete: true,
    removeOnFail:     false,
  },
})

const expireQueue = new Bull<ExpireJobData>('artsony:queue:payment:expire', {
  redis: config.redis.url,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 5_000 },
    removeOnComplete: true,
    removeOnFail:     false,
  },
})

// ── Processors ────────────────────────────────────────────────────────────────

verifyQueue.process(async (job) => {
  const { transaction_id, retry_count } = job.data

  await paymentService.verifyTransaction(transaction_id)

  // Re-fetch transaction to check if it still needs retrying
  const result = await (supabase() as any)
    .from('transactions')
    .select('status, retry_count')
    .eq('id', transaction_id)
    .single()

  if (result.error || !result.data) return

  const status      = result.data['status'] as string
  const nextRetry   = result.data['retry_count'] as number

  // If still CONFIRMING and retries remain — schedule next check with backoff
  if (status === 'CONFIRMING' && nextRetry < 5) {
    const delay = paymentService.getRetryDelayMs(nextRetry)
    await scheduleVerification(transaction_id, nextRetry, delay)
  }
})

expireQueue.process(async () => {
  await orderService.expireStaleOrders()
})

// ── Error handlers ────────────────────────────────────────────────────────────

verifyQueue.on('failed', (job, err) => {
  console.error(
    `[PaymentVerifyQueue] Job ${job.id} failed for tx ${job.data.transaction_id}:`,
    err.message,
  )
})

expireQueue.on('failed', (job, err) => {
  console.error(`[PaymentExpireQueue] Job ${job.id} failed:`, err.message)
})

// ── Public scheduling helpers ─────────────────────────────────────────────────

/**
 * Enqueues a verification job for a transaction.
 * Called by the order service after a buyer submits a tx_hash.
 * delay defaults to the first backoff slot (30s) for the initial check.
 */
export async function scheduleVerification(
  transactionId: string,
  retryCount    = 0,
  delayMs       = 30_000,
): Promise<void> {
  await verifyQueue.add(
    { transaction_id: transactionId, retry_count: retryCount },
    { delay: delayMs, jobId: `verify:${transactionId}:${retryCount}` },
  )
}

/**
 * Starts the recurring expiry job. Called once at app startup.
 * Runs every 5 minutes — finds PENDING/CONFIRMING transactions past
 * expires_at, cancels their orders, and releases stock.
 */
export async function startExpireScheduler(): Promise<void> {
  // Remove any existing repeat job to avoid duplicates on restart
  const existing = await expireQueue.getRepeatableJobs()
  for (const job of existing) {
    await expireQueue.removeRepeatableByKey(job.key)
  }

  await expireQueue.add(
    {},
    { repeat: { every: 5 * 60 * 1000 }, jobId: 'expire:recurring' },
  )

  console.log('[PaymentExpireQueue] Recurring expiry job registered (every 5 min)')
}