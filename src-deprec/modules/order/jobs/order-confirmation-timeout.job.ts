import Bull from 'bull'
import { config } from '@/config'
import { physicalOrderRepository } from '../repositories/physical-order.repository'
import { BUYER_ARTIST_CANCELLABLE_STATES } from '@/common/types/commerce.types'
import type { TimelineStatus } from '@/common/types/commerce.types'

// ── Queue ─────────────────────────────────────────────────────────────────────

export const orderConfirmationQueue = new Bull<{ physicalId: string; orderId: string }>(
  'artsony:order:confirmation-timeout',
  {
    redis: config.redis.url,
    defaultJobOptions: {
      attempts:       1,       // no retry — if item is already confirmed, job is a no-op
      removeOnComplete: true,
      removeOnFail:   false,
    },
  },
)

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

// ── Enqueue ───────────────────────────────────────────────────────────────────
// Called by the physical order service when an item enters AWAITING_CONFIRMATION.
// Job ID is deterministic so re-scheduling for the same item is idempotent.

export async function scheduleConfirmationTimeout(
  physicalId: string,
  orderId:    string,
): Promise<void> {
  const jobId = `confirm-timeout:${physicalId}`

  // Remove any pre-existing job for this item before adding a fresh one.
  // This handles the edge case where a job already exists (e.g. service restart).
  const existing = await orderConfirmationQueue.getJob(jobId)
  if (existing) await existing.remove()

  await orderConfirmationQueue.add(
    { physicalId, orderId },
    {
      jobId,
      delay: FOURTEEN_DAYS_MS,
    },
  )
}

// ── Cancel the scheduled job ──────────────────────────────────────────────────
// Called when an artist manually confirms before the deadline,
// or when admin/buyer cancels the item first.

export async function cancelConfirmationTimeout(physicalId: string): Promise<void> {
  const jobId  = `confirm-timeout:${physicalId}`
  const job    = await orderConfirmationQueue.getJob(jobId)
  if (job) await job.remove()
}

// ── Processor ─────────────────────────────────────────────────────────────────

orderConfirmationQueue.process(async (job) => {
  const { physicalId, orderId } = job.data

  const physical = await physicalOrderRepository.findByOrderItemId(physicalId)
    .catch(() => null)

  // If item no longer exists or is already past the cancellable window, skip.
  if (!physical) return
  if (!BUYER_ARTIST_CANCELLABLE_STATES.has(physical.timeline_status as TimelineStatus)) return

  // Atomically transition to ORDER_FAILED_TO_CONFIRM and append timeline event.
  await physicalOrderRepository.transitionStatus({
    physicalId,
    newStatus:  'ORDER_FAILED_TO_CONFIRM',
    isPending:  false,
    actorId:    null,
    actorRole:  'system',
    notes:      'Artist did not confirm the order within 14 days. Auto-cancelled by system.',
    metadata:   { auto_cancel: true, trigger: 'confirmation_timeout', orderId },
  })

  // Mark delivery_status as CANCELLED — the RPC already handles this via
  // the CASE expression in transition_item_timeline, but we import the
  // notification dispatch here so it stays co-located with the job.
  await dispatchAutoCancel(physicalId, orderId)
})

// ── Notification dispatch ─────────────────────────────────────────────────────
// We dynamically import to avoid circular dependencies with the service layer.

async function dispatchAutoCancel(physicalId: string, orderId: string): Promise<void> {
  try {
    const { physicalOrderService } = await import('../services/physical-order.service.js')
    await physicalOrderService.notifyAutoCancel(physicalId, orderId)
  } catch (err) {
    // Notification failure must never crash the job.
    console.error('[orderConfirmationQueue] notification dispatch failed:', err)
  }
}

// ── Error handler ─────────────────────────────────────────────────────────────

orderConfirmationQueue.on('failed', (job, err) => {
  console.error(
    `[orderConfirmationQueue] job ${job.id} failed:`,
    err.message,
  )
})