"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFollowValidation = exports.toggleFollowValidation = void 0;
exports.handleToggleFollow = handleToggleFollow;
exports.handleIsFollowing = handleIsFollowing;
exports.handleListFollowers = handleListFollowers;
exports.handleListFollowing = handleListFollowing;
const express_validator_1 = require("express-validator");
const follow_service_1 = require("../services/follow.service");
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
exports.toggleFollowValidation = [
    (0, express_validator_1.param)('userId').isUUID(),
];
exports.listFollowValidation = [
    (0, express_validator_1.param)('userId').isUUID(),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];
// ── Handlers ──────────────────────────────────────────────────────────────────
async function handleToggleFollow(req, res, next) {
    try {
        assertValid(req);
        const { sub } = requireAuth(req);
        const { userId } = req.params;
        const result = await follow_service_1.followService.toggle(sub, userId);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
async function handleIsFollowing(req, res, next) {
    try {
        assertValid(req);
        const { sub } = requireAuth(req);
        const { userId } = req.params;
        const is_following = await follow_service_1.followService.isFollowing(sub, userId);
        res.json({ success: true, data: { is_following } });
    }
    catch (err) {
        next(err);
    }
}
async function handleListFollowers(req, res, next) {
    try {
        assertValid(req);
        const { userId } = req.params;
        const { page, limit } = req.query;
        const result = await follow_service_1.followService.listFollowers(userId, { page, limit });
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function handleListFollowing(req, res, next) {
    try {
        assertValid(req);
        const { userId } = req.params;
        const { page, limit } = req.query;
        const result = await follow_service_1.followService.listFollowing(userId, { page, limit });
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=follow.controller.js.map