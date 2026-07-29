"use strict";
// ── Enums (mirror SQL enum exactly) ──────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.SELLER_REGISTRATION_TRANSITIONS = void 0;
// ── State machine ──────────────────────────────────────────────────────────────
// Authoritative in application code; transition_seller_registration() in
// 20240701000000_seller_registration_schema.sql carries the same table as a
// race-safe fallback enforced inside the DB transaction.
//
// REJECTED has no admin-reachable outbound transitions — resubmission back to
// PENDING is user-initiated via submit_seller_registration(), not an admin
// status change, so it is intentionally absent here.
exports.SELLER_REGISTRATION_TRANSITIONS = {
    PENDING: ['APPROVED', 'REJECTED'],
    APPROVED: ['SUSPENDED'],
    REJECTED: [],
    SUSPENDED: ['APPROVED', 'REJECTED'],
};
//# sourceMappingURL=seller.types.js.map