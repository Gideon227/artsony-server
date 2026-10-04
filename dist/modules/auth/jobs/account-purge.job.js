"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleAccountPurge = scheduleAccountPurge;
exports.cancelAccountPurge = cancelAccountPurge;
exports.startAccountPurgeSweep = startAccountPurgeSweep;
const bull_1 = __importDefault(require("bull"));
const config_1 = require("../../../config");
const user_repository_1 = require("../repositories/user.repository");
const GRACE_MS = config_1.config.queue.accountDeletionGraceDays * 24 * 60 * 60 * 1000;
// ── Queues ────────────────────────────────────────────────────────────────────
const purgeQueue = new bull_1.default(config_1.config.queue.deletionQueue, {
    redis: config_1.config.redis.url,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: false,
    },
});
const sweepQueue = new bull_1.default(`${config_1.config.queue.deletionQueue}:sweep`, {
    redis: config_1.config.redis.url,
    defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: false,
    },
});
// ── Purge a single account ───────────────────────────────────────────────────
async function purgeIfStillEligible(userId) {
    const user = await user_repository_1.userRepository.findByIdIncludingDeleted(userId);
    if (!user)
        return; // already hard-deleted some other way
    if (user.status !== 'DELETED')
        return; // restored by support before purge ran
    if (user.deleted_at === null)
        return; // defensive — shouldn't happen if status is DELETED
    if (user.purged_at)
        return; // already purged (sweep caught it first)
    await user_repository_1.userRepository.purgeUser(userId);
}
// ── Processors ────────────────────────────────────────────────────────────────
purgeQueue.process(async (job) => {
    await purgeIfStillEligible(job.data.userId);
});
sweepQueue.process(async () => {
    const cutoff = new Date(Date.now() - GRACE_MS);
    const candidates = await user_repository_1.userRepository.findPurgeCandidates(cutoff);
    for (const user of candidates) {
        try {
            await purgeIfStillEligible(user.id);
        }
        catch (err) {
            // One failure must not block the rest of the sweep batch.
            console.error(`[AccountPurgeSweep] Failed to purge user ${user.id}:`, err);
        }
    }
});
// ── Error handlers ────────────────────────────────────────────────────────────
purgeQueue.on('failed', (job, err) => {
    console.error(`[AccountPurgeQueue] Job ${job.id} failed for user ${job.data.userId}:`, err.message);
});
sweepQueue.on('failed', (job, err) => {
    console.error(`[AccountPurgeSweepQueue] Sweep job ${job.id} failed:`, err.message);
});
// ── Public scheduling helpers ─────────────────────────────────────────────────
/**
 * Schedules the one-shot purge for an account, timed to its grace period.
 * Called by deleteAccount() immediately after soft-deleting the user.
 * Job ID is deterministic so re-scheduling (e.g. if deleteAccount were ever
 * called twice for the same user) is idempotent rather than stacking jobs.
 */
async function scheduleAccountPurge(userId) {
    const jobId = `purge-account:${userId}`;
    const existing = await purgeQueue.getJob(jobId);
    if (existing)
        await existing.remove();
    await purgeQueue.add({ userId }, { jobId, delay: GRACE_MS });
}
/**
 * Cancels a pending purge — for a future "restore my account" flow.
 * No such flow exists yet (the deletion email currently just says to
 * contact support), but this mirrors cancelConfirmationTimeout's symmetric
 * shape so it's a drop-in once one does.
 */
async function cancelAccountPurge(userId) {
    const job = await purgeQueue.getJob(`purge-account:${userId}`);
    if (job)
        await job.remove();
}
/**
 * Starts the recurring sweep. Called once at app startup (see server.ts).
 * Runs daily — catches accounts whose one-shot job was lost, and the
 * backlog of accounts soft-deleted before this purge mechanism existed.
 */
async function startAccountPurgeSweep() {
    const existing = await sweepQueue.getRepeatableJobs();
    for (const job of existing) {
        await sweepQueue.removeRepeatableByKey(job.key);
    }
    await sweepQueue.add({}, { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: 'purge-sweep:recurring' });
    console.log('[AccountPurgeSweepQueue] Recurring purge sweep registered (every 24h)');
}
//# sourceMappingURL=account-purge.job.js.map