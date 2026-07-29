"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitRegistration = submitRegistration;
exports.getMyRegistration = getMyRegistration;
exports.updateMyRegistration = updateMyRegistration;
exports.getRegistrationById = getRegistrationById;
exports.listRegistrations = listRegistrations;
exports.approveRegistration = approveRegistration;
exports.rejectRegistration = rejectRegistration;
exports.suspendRegistration = suspendRegistration;
exports.reactivateRegistration = reactivateRegistration;
const seller_repository_1 = require("../repositories/seller.repository");
const audit_repository_1 = require("../../../modules/auth/repositories/audit.repository");
const errors_1 = require("../../../common/errors");
const seller_types_1 = require("../../../common/types/seller.types");
// ── Error-code narrowing ──────────────────────────────────────────────────────
// Repositories in this codebase throw plain Error objects with a `.code`
// property attached (see seller.repository.ts) rather than domain errors —
// that translation happens here, in the service layer.
function hasErrorCode(err) {
    return typeof err === 'object' && err !== null && 'code' in err;
}
// ── Submit / Resubmit ──────────────────────────────────────────────────────────
async function submitRegistration(userId, input, ctx) {
    const existing = await seller_repository_1.sellerRepository.findByUserId(userId);
    if (existing && existing.status !== 'REJECTED') {
        throw new errors_1.ConflictError(`You already have a seller registration (status: ${existing.status})`);
    }
    let registration;
    try {
        registration = await seller_repository_1.sellerRepository.submit(userId, input);
    }
    catch (err) {
        if (hasErrorCode(err) && err.code === '23505') {
            throw new errors_1.ConflictError('You already have a seller registration');
        }
        throw err;
    }
    audit_repository_1.auditRepository.log({
        userId,
        action: 'SELLER_REGISTRATION_SUBMITTED',
        ...(ctx.ipAddress && { ipAddress: ctx.ipAddress }),
        ...(ctx.userAgent && { userAgent: ctx.userAgent }),
        metadata: { registrationId: registration.id, resubmission: Boolean(existing) },
    });
    return registration;
}
// ── Self-service read / edit ──────────────────────────────────────────────────
async function getMyRegistration(userId) {
    const registration = await seller_repository_1.sellerRepository.findByUserId(userId);
    if (!registration)
        throw new errors_1.NotFoundError('Seller registration');
    return registration;
}
async function updateMyRegistration(userId, input) {
    const updated = await seller_repository_1.sellerRepository.updatePendingByUser(userId, input);
    if (updated)
        return updated;
    // Guarded update matched no row — disambiguate why, without an extra
    // lookup on the (much more common) success path above.
    const existing = await seller_repository_1.sellerRepository.findByUserId(userId);
    if (!existing)
        throw new errors_1.NotFoundError('Seller registration');
    throw new errors_1.AppError('Only a pending seller registration can be edited', 409, 'SELLER_REGISTRATION_NOT_PENDING');
}
// ── Admin: read ────────────────────────────────────────────────────────────────
async function getRegistrationById(id) {
    const registration = await seller_repository_1.sellerRepository.findById(id);
    if (!registration)
        throw new errors_1.NotFoundError('Seller registration');
    return registration;
}
async function listRegistrations(filters) {
    return seller_repository_1.sellerRepository.list(filters);
}
// ── Admin: status transitions ─────────────────────────────────────────────────
// One shared implementation for approve / reject / suspend / reactivate.
//
// `allowedFrom` is deliberately specific per action (not just "is newStatus
// reachable from the current status" via SELLER_REGISTRATION_TRANSITIONS) —
// APPROVED is reachable from both PENDING and SUSPENDED, and without this
// distinction the /reactivate endpoint could silently approve a PENDING
// registration that was never suspended, or /approve could reinstate a
// SUSPENDED one. Each endpoint below passes exactly the starting state(s)
// that make sense for what it claims to do.
//
// SELLER_REGISTRATION_TRANSITIONS is still consulted as a second, generic
// check — belt-and-braces against this function's allowedFrom ever drifting
// out of sync with the state machine — and transition_seller_registration()
// re-validates the same table again inside the DB transaction as the
// authoritative, race-safe guard.
async function changeStatus(id, allowedFrom, newStatus, adminId, notes, action, ctx) {
    const current = await seller_repository_1.sellerRepository.findById(id);
    if (!current)
        throw new errors_1.NotFoundError('Seller registration');
    const generallyLegal = seller_types_1.SELLER_REGISTRATION_TRANSITIONS[current.status].includes(newStatus);
    if (!allowedFrom.includes(current.status) || !generallyLegal) {
        throw new errors_1.AppError(`Cannot move a ${current.status} registration to ${newStatus}`, 409, 'SELLER_REGISTRATION_INVALID_TRANSITION');
    }
    let updated;
    try {
        updated = await seller_repository_1.sellerRepository.transition(id, newStatus, adminId, notes);
    }
    catch {
        // Reaching here despite the pre-check above means another admin request
        // changed the status concurrently between our read and this write.
        throw new errors_1.ConflictError('This seller registration was modified by another request. Please refresh and try again.');
    }
    audit_repository_1.auditRepository.log({
        userId: adminId,
        action,
        ...(ctx.ipAddress && { ipAddress: ctx.ipAddress }),
        ...(ctx.userAgent && { userAgent: ctx.userAgent }),
        metadata: {
            registrationId: id,
            targetUserId: updated.user_id,
            fromStatus: current.status,
            toStatus: newStatus,
            notes,
        },
    });
    return updated;
}
// Initial review only — a registration that has already been through the
// suspend/reactivate cycle must use reactivateRegistration() instead, even
// though both ultimately set the same APPROVED status.
function approveRegistration(id, adminId, notes, ctx) {
    return changeStatus(id, ['PENDING'], 'APPROVED', adminId, notes, 'SELLER_REGISTRATION_APPROVED', ctx);
}
// Reachable from PENDING (initial review) or SUSPENDED (permanent removal
// after a suspension) — the two edge cases the brief calls out explicitly
// ("artwork already exists when seller becomes suspended or rejected").
function rejectRegistration(id, adminId, notes, ctx) {
    return changeStatus(id, ['PENDING', 'SUSPENDED'], 'REJECTED', adminId, notes, 'SELLER_REGISTRATION_REJECTED', ctx);
}
function suspendRegistration(id, adminId, notes, ctx) {
    return changeStatus(id, ['APPROVED'], 'SUSPENDED', adminId, notes, 'SELLER_REGISTRATION_SUSPENDED', ctx);
}
// Only reachable from SUSPENDED — see approveRegistration() above for why
// this is a distinct function from the initial-approval path despite both
// setting status to APPROVED.
function reactivateRegistration(id, adminId, notes, ctx) {
    return changeStatus(id, ['SUSPENDED'], 'APPROVED', adminId, notes, 'SELLER_REGISTRATION_REACTIVATED', ctx);
}
//# sourceMappingURL=seller.service.js.map