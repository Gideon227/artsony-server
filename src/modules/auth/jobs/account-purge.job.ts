import Bull from 'bull'
import { config } from '@/config'
import { userRepository } from '../repositories/user.repository'

// ─────────────────────────────────────────────────────────────────────────
// Enforces the account deletion grace period that deleteAccount() promises
// in its confirmation email but never previously acted on: soft-deleted
// accounts stayed soft-deleted forever, with nothing ever anonymizing them
// once the stated grace period elapsed.
//
// Two mechanisms, same as the existing order-confirmation-timeout /
// payment-expire jobs elsewhere in this codebase:
//   1. A one-shot delayed job per account, scheduled at deletion time —
//      fires exactly when that account's grace period ends.
//   2. A periodic sweep as a safety net for jobs lost to Redis data loss,
//      and to retroactively clean up the backlog of accounts that were
//      soft-deleted before this mechanism existed.
// Both converge on the same idempotent purgeUser(), guarded by a re-check
// that the account is still DELETED (in case support manually restored it)
// and hasn't already been purged.
// ─────────────────────────────────────────────────────────────────────────

type PurgeJobData = { userId: string }
type SweepJobData = Record<string, never>

const GRACE_MS = config.queue.accountDeletionGraceDays * 24 * 60 * 60 * 1000

// ── Queues ────────────────────────────────────────────────────────────────────

const purgeQueue = new Bull<PurgeJobData>(config.queue.deletionQueue, {
  redis: config.redis.url,
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: 'exponential', delay: 60_000 },
    removeOnComplete: true,
    removeOnFail:     false,
  },
})

const sweepQueue = new Bull<SweepJobData>(`${config.queue.deletionQueue}:sweep`, {
  redis: config.redis.url,
  defaultJobOptions: {
    attempts:         1,
    removeOnComplete: true,
    removeOnFail:     false,
  },
})

// ── Purge a single account ───────────────────────────────────────────────────

async function purgeIfStillEligible(userId: string): Promise<void> {
  const user = await userRepository.findByIdIncludingDeleted(userId)
  if (!user) return                          // already hard-deleted some other way
  if (user.status !== 'DELETED') return      // restored by support before purge ran
  if (user.deleted_at === null) return       // defensive — shouldn't happen if status is DELETED
  if (user.purged_at) return                 // already purged (sweep caught it first)

  await userRepository.purgeUser(userId)
}

// ── Processors ────────────────────────────────────────────────────────────────

purgeQueue.process(async (job) => {
  await purgeIfStillEligible(job.data.userId)
})

sweepQueue.process(async () => {
  const cutoff = new Date(Date.now() - GRACE_MS)
  const candidates = await userRepository.findPurgeCandidates(cutoff)

  for (const user of candidates) {
    try {
      await purgeIfStillEligible(user.id)
    } catch (err) {
      // One failure must not block the rest of the sweep batch.
      console.error(`[AccountPurgeSweep] Failed to purge user ${user.id}:`, err)
    }
  }
})

// ── Error handlers ────────────────────────────────────────────────────────────

purgeQueue.on('failed', (job, err) => {
  console.error(`[AccountPurgeQueue] Job ${job.id} failed for user ${job.data.userId}:`, err.message)
})

sweepQueue.on('failed', (job, err) => {
  console.error(`[AccountPurgeSweepQueue] Sweep job ${job.id} failed:`, err.message)
})

// ── Public scheduling helpers ─────────────────────────────────────────────────

/**
 * Schedules the one-shot purge for an account, timed to its grace period.
 * Called by deleteAccount() immediately after soft-deleting the user.
 * Job ID is deterministic so re-scheduling (e.g. if deleteAccount were ever
 * called twice for the same user) is idempotent rather than stacking jobs.
 */
export async function scheduleAccountPurge(userId: string): Promise<void> {
  const jobId = `purge-account:${userId}`

  const existing = await purgeQueue.getJob(jobId)
  if (existing) await existing.remove()

  await purgeQueue.add({ userId }, { jobId, delay: GRACE_MS })
}

/**
 * Cancels a pending purge — for a future "restore my account" flow.
 * No such flow exists yet (the deletion email currently just says to
 * contact support), but this mirrors cancelConfirmationTimeout's symmetric
 * shape so it's a drop-in once one does.
 */
export async function cancelAccountPurge(userId: string): Promise<void> {
  const job = await purgeQueue.getJob(`purge-account:${userId}`)
  if (job) await job.remove()
}

/**
 * Starts the recurring sweep. Called once at app startup (see server.ts).
 * Runs daily — catches accounts whose one-shot job was lost, and the
 * backlog of accounts soft-deleted before this purge mechanism existed.
 */
export async function startAccountPurgeSweep(): Promise<void> {
  const existing = await sweepQueue.getRepeatableJobs()
  for (const job of existing) {
    await sweepQueue.removeRepeatableByKey(job.key)
  }

  await sweepQueue.add(
    {},
    { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'purge-sweep:recurring' },
  )

  console.log('[AccountPurgeSweepQueue] Recurring purge sweep registered (every 24h)')
}
