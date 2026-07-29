"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderConfirmationQueue = void 0;
exports.scheduleConfirmationTimeout = scheduleConfirmationTimeout;
exports.cancelConfirmationTimeout = cancelConfirmationTimeout;
const bull_1 = __importDefault(require("bull"));
const config_1 = require("../../../config");
const physical_order_repository_1 = require("../repositories/physical-order.repository");
const commerce_types_1 = require("../../../common/types/commerce.types");
// ── Queue ─────────────────────────────────────────────────────────────────────
exports.orderConfirmationQueue = new bull_1.default('artsony:order:confirmation-timeout', {
    redis: config_1.config.redis.url,
    defaultJobOptions: {
        attempts: 1, // no retry — if item is already confirmed, job is a no-op
        removeOnComplete: true,
        removeOnFail: false,
    },
});
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
// ── Enqueue ───────────────────────────────────────────────────────────────────
// Called by the physical order service when an item enters AWAITING_CONFIRMATION.
// Job ID is deterministic so re-scheduling for the same item is idempotent.
async function scheduleConfirmationTimeout(physicalId, orderId) {
    const jobId = `confirm-timeout:${physicalId}`;
    // Remove any pre-existing job for this item before adding a fresh one.
    // This handles the edge case where a job already exists (e.g. service restart).
    const existing = await exports.orderConfirmationQueue.getJob(jobId);
    if (existing)
        await existing.remove();
    await exports.orderConfirmationQueue.add({ physicalId, orderId }, {
        jobId,
        delay: FOURTEEN_DAYS_MS,
    });
}
// ── Cancel the scheduled job ──────────────────────────────────────────────────
// Called when an artist manually confirms before the deadline,
// or when admin/buyer cancels the item first.
async function cancelConfirmationTimeout(physicalId) {
    const jobId = `confirm-timeout:${physicalId}`;
    const job = await exports.orderConfirmationQueue.getJob(jobId);
    if (job)
        await job.remove();
}
// ── Processor ─────────────────────────────────────────────────────────────────
exports.orderConfirmationQueue.process(async (job) => {
    const { physicalId, orderId } = job.data;
    const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(physicalId)
        .catch(() => null);
    // If item no longer exists or is already past the cancellable window, skip.
    if (!physical)
        return;
    if (!commerce_types_1.BUYER_ARTIST_CANCELLABLE_STATES.has(physical.timeline_status))
        return;
    // Atomically transition to ORDER_FAILED_TO_CONFIRM and append timeline event.
    await physical_order_repository_1.physicalOrderRepository.transitionStatus({
        physicalId,
        newStatus: 'ORDER_FAILED_TO_CONFIRM',
        isPending: false,
        actorId: null,
        actorRole: 'system',
        notes: 'Artist did not confirm the order within 14 days. Auto-cancelled by system.',
        metadata: { auto_cancel: true, trigger: 'confirmation_timeout', orderId },
    });
    // Mark delivery_status as CANCELLED — the RPC already handles this via
    // the CASE expression in transition_item_timeline, but we import the
    // notification dispatch here so it stays co-located with the job.
    await dispatchAutoCancel(physicalId, orderId);
});
// ── Notification dispatch ─────────────────────────────────────────────────────
// We dynamically import to avoid circular dependencies with the service layer.
async function dispatchAutoCancel(physicalId, orderId) {
    try {
        const { physicalOrderService } = await import('../services/physical-order.service.js');
        await physicalOrderService.notifyAutoCancel(physicalId, orderId);
    }
    catch (err) {
        // Notification failure must never crash the job.
        console.error('[orderConfirmationQueue] notification dispatch failed:', err);
    }
}
// ── Error handler ─────────────────────────────────────────────────────────────
exports.orderConfirmationQueue.on('failed', (job, err) => {
    console.error(`[orderConfirmationQueue] job ${job.id} failed:`, err.message);
});
//# sourceMappingURL=order-confirmation-timeout.job.js.map