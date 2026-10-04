"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listBlockedValidation = exports.blockUserValidation = void 0;
exports.handleBlockUser = handleBlockUser;
exports.handleUnblockUser = handleUnblockUser;
exports.handleListBlocked = handleListBlocked;
const express_validator_1 = require("express-validator");
const block_service_1 = require("../services/block.service");
const errors_1 = require("../../../common/errors");
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
// ── Validation chains ────────────────────────────────────────────────────────
exports.blockUserValidation = [
    (0, express_validator_1.param)('userId').isUUID(),
];
exports.listBlockedValidation = [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];
// ── Handlers ──────────────────────────────────────────────────────────────────
async function handleBlockUser(req, res, next) {
    try {
        assertValid(req);
        const { sub } = requireAuth(req);
        const { userId } = req.params;
        await block_service_1.blockService.block(sub, userId);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
}
async function handleUnblockUser(req, res, next) {
    try {
        assertValid(req);
        const { sub } = requireAuth(req);
        const { userId } = req.params;
        await block_service_1.blockService.unblock(sub, userId);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
}
async function handleListBlocked(req, res, next) {
    try {
        assertValid(req);
        const { sub } = requireAuth(req);
        const { page, limit } = req.query;
        const result = await block_service_1.blockService.listBlocked(sub, { page, limit });
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=block.controller.js.map