"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ARTIST_PENDING_STATUSES = exports.BUYER_ARTIST_CANCELLABLE_STATES = exports.PHYSICAL_TRANSITIONS = exports.PLATFORM_SERVICE_FEE_RATE = exports.TRANSACTION_TRANSITIONS = exports.ORDER_TRANSITIONS = void 0;
// ── Order state machine ───────────────────────────────────────────────────────
// Defines which status transitions are legal. Used by the order service
// to validate every status update call before touching the DB.
exports.ORDER_TRANSITIONS = {
    PENDING_PAYMENT: ['PAYMENT_CONFIRMED', 'CANCELLED'],
    PAYMENT_CONFIRMED: ['PROCESSING', 'FULFILLED'], // FULFILLED = digital fast-path
    PROCESSING: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['COMPLETED'],
    FULFILLED: ['COMPLETED'],
    COMPLETED: ['REFUNDED'],
    CANCELLED: [],
    REFUNDED: [],
};
exports.TRANSACTION_TRANSITIONS = {
    PENDING: ['CONFIRMING', 'EXPIRED', 'FAILED'],
    CONFIRMING: ['CONFIRMED', 'FAILED', 'EXPIRED'],
    CONFIRMED: [],
    FAILED: [],
    EXPIRED: [],
};
// ── Service fee constant ──────────────────────────────────────────────────────
exports.PLATFORM_SERVICE_FEE_RATE = 0.14; // 14% of item cost (not shipping)
// ── Physical pipeline state machine ──────────────────────────────────────────
// Maps each state to the set of states it can transition into.
// Admins only — artists/buyers have narrower permission checks in the service.
exports.PHYSICAL_TRANSITIONS = {
    ORDER_RECEIVED: ['ORDER_RECEIVED_ACTIVE'],
    ORDER_RECEIVED_ACTIVE: ['AWAITING_CONFIRMATION'],
    AWAITING_CONFIRMATION: ['AWAITING_CONFIRMATION_ACTIVE', 'ORDER_FAILED_TO_CONFIRM'],
    AWAITING_CONFIRMATION_ACTIVE: ['AWAITING_PICKUP', 'ORDER_FAILED_TO_CONFIRM'],
    ORDER_FAILED_TO_CONFIRM: [],
    AWAITING_PICKUP: ['AWAITING_PICKUP_ACTIVE', 'PICKUP_FAILED', 'COURIER_REJECTED_PICKUP'],
    AWAITING_PICKUP_ACTIVE: ['PICKED_UP', 'PICKUP_FAILED', 'COURIER_REJECTED_PICKUP'],
    PICKUP_FAILED: ['AWAITING_PICKUP'],
    COURIER_REJECTED_PICKUP: ['AWAITING_PICKUP'],
    PICKED_UP: ['PICKED_UP_ACTIVE'],
    PICKED_UP_ACTIVE: ['IN_TRANSIT'],
    IN_TRANSIT: ['IN_TRANSIT_ACTIVE'],
    IN_TRANSIT_ACTIVE: ['OUT_FOR_DELIVERY', 'DELAYED_DELIVERY', 'DELIVERY_FAILED'],
    DELAYED_DELIVERY: ['OUT_FOR_DELIVERY', 'DELIVERY_FAILED'],
    OUT_FOR_DELIVERY: ['OUT_FOR_DELIVERY_ACTIVE'],
    OUT_FOR_DELIVERY_ACTIVE: ['DELIVERED', 'DELIVERY_FAILED'],
    DELIVERED: [],
    DELIVERY_FAILED: [],
};
// ── Cancellation boundary ─────────────────────────────────────────────────────
// Buyer or artist can only cancel while the item is within these states.
exports.BUYER_ARTIST_CANCELLABLE_STATES = new Set([
    'ORDER_RECEIVED',
    'ORDER_RECEIVED_ACTIVE',
    'AWAITING_CONFIRMATION',
    'AWAITING_CONFIRMATION_ACTIVE',
]);
// "Pending" for an artist = items not yet confirmed (ORDER_RECEIVED /
// ORDER_RECEIVED_ACTIVE / AWAITING_CONFIRMATION / AWAITING_CONFIRMATION_ACTIVE).
// "Live" = confirmed and in the shipping pipeline, not yet delivered/cancelled.
// "Completed" = DELIVERED. "Cancelled" = delivery_status CANCELLED.
exports.ARTIST_PENDING_STATUSES = [
    'ORDER_RECEIVED',
    'ORDER_RECEIVED_ACTIVE',
    'AWAITING_CONFIRMATION',
    'AWAITING_CONFIRMATION_ACTIVE',
];
//# sourceMappingURL=commerce.types.js.map