"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transitionWithdrawalValidation = exports.listLedgerValidation = exports.requestWithdrawalValidation = void 0;
exports.handleGetBalance = handleGetBalance;
exports.handleListLedger = handleListLedger;
exports.handleRequestWithdrawal = handleRequestWithdrawal;
exports.handleListMyWithdrawals = handleListMyWithdrawals;
exports.handleCancelMyWithdrawal = handleCancelMyWithdrawal;
exports.handleAdminListWithdrawals = handleAdminListWithdrawals;
exports.handleAdminTransitionWithdrawal = handleAdminTransitionWithdrawal;
exports.handleAdminGetArtistBalance = handleAdminGetArtistBalance;
const express_validator_1 = require("express-validator");
const wallet_service_1 = require("../services/wallet.service");
const errors_1 = require("../../../common/errors");
const object_utils_1 = require("../../../common/utils/object.utils");
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
function requireAuth(req) {
    if (!req.auth)
        throw new errors_1.UnauthorizedError();
    return req.auth;
}
// ── Validation chains ────────────────────────────────────────────────────────────
exports.requestWithdrawalValidation = [
    (0, express_validator_1.body)('amount').isFloat({ gt: 0 }).withMessage('amount must be a positive number'),
    (0, express_validator_1.body)('destination_type').isIn(['WALLET_ADDRESS', 'BANK_ACCOUNT']),
    (0, express_validator_1.body)('destination_details').isObject(),
];
exports.listLedgerValidation = [
    (0, express_validator_1.query)('category').optional().isIn(['SALE', 'WITHDRAWAL', 'REFUND', 'ADJUSTMENT']),
    (0, express_validator_1.query)('hold_status').optional().isIn(['PENDING_DELIVERY', 'ON_HOLD', 'AVAILABLE']),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];
exports.transitionWithdrawalValidation = [
    (0, express_validator_1.param)('id').isUUID(),
    (0, express_validator_1.body)('status').isIn(['PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED']),
    (0, express_validator_1.body)('notes').optional().isString().isLength({ max: 1000 }),
];
// ── Self-service handlers ─────────────────────────────────────────────────────
async function handleGetBalance(req, res, next) {
    try {
        const { sub } = requireAuth(req);
        const summary = await wallet_service_1.walletService.getBalanceSummary(sub);
        res.json({ success: true, data: summary });
    }
    catch (err) {
        next(err);
    }
}
async function handleListLedger(req, res, next) {
    try {
        assertValid(req);
        const { sub } = requireAuth(req);
        const q = req.query;
        const result = await wallet_service_1.walletService.listLedger(sub, (0, object_utils_1.compact)({
            category: q['category'],
            hold_status: q['hold_status'],
            date_from: q['date_from'],
            date_to: q['date_to'],
            page: q['page'] ? Number(q['page']) : undefined,
            limit: q['limit'] ? Number(q['limit']) : undefined,
        }));
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function handleRequestWithdrawal(req, res, next) {
    try {
        assertValid(req);
        const { sub } = requireAuth(req);
        const { amount, destination_type, destination_details, idempotency_key } = req.body;
        const request = await wallet_service_1.walletService.requestWithdrawal({
            userId: sub,
            amount,
            destinationType: destination_type,
            destinationDetails: destination_details,
            ...(0, object_utils_1.compact)({ idempotencyKey: idempotency_key }),
        });
        res.status(201).json({ success: true, data: request });
    }
    catch (err) {
        next(err);
    }
}
async function handleListMyWithdrawals(req, res, next) {
    try {
        const { sub } = requireAuth(req);
        const q = req.query;
        const result = await wallet_service_1.walletService.listMyWithdrawals(sub, (0, object_utils_1.compact)({
            status: q['status'],
            page: q['page'] ? Number(q['page']) : undefined,
            limit: q['limit'] ? Number(q['limit']) : undefined,
        }));
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function handleCancelMyWithdrawal(req, res, next) {
    try {
        const { sub } = requireAuth(req);
        const { id } = req.params;
        const request = await wallet_service_1.walletService.cancelMyWithdrawal(sub, id);
        res.json({ success: true, data: request });
    }
    catch (err) {
        next(err);
    }
}
// ── Admin handlers ────────────────────────────────────────────────────────────
async function handleAdminListWithdrawals(req, res, next) {
    try {
        const q = req.query;
        const result = await wallet_service_1.walletService.adminListWithdrawals((0, object_utils_1.compact)({
            userId: q['user_id'],
            status: q['status'],
            page: q['page'] ? Number(q['page']) : undefined,
            limit: q['limit'] ? Number(q['limit']) : undefined,
        }));
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function handleAdminTransitionWithdrawal(req, res, next) {
    try {
        assertValid(req);
        const { sub } = requireAuth(req);
        const { id } = req.params;
        const { status, notes } = req.body;
        const request = await wallet_service_1.walletService.adminTransitionWithdrawal({
            requestId: id,
            newStatus: status,
            adminId: sub,
            ...(0, object_utils_1.compact)({ notes }),
        });
        res.json({ success: true, data: request });
    }
    catch (err) {
        next(err);
    }
}
async function handleAdminGetArtistBalance(req, res, next) {
    try {
        const { userId } = req.params;
        await wallet_service_1.walletService.assertArtistExists(userId);
        const summary = await wallet_service_1.walletService.getBalanceSummary(userId);
        res.json({ success: true, data: summary });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=wallet.controller.js.map