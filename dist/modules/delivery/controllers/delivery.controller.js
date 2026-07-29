"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenParamValidation = exports.downloadRateLimit = void 0;
exports.handleRedeemToken = handleRedeemToken;
exports.handleGetMyDownloads = handleGetMyDownloads;
const express_validator_1 = require("express-validator");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const delivery_service_1 = require("../services/delivery.service");
const errors_1 = require("../../../common/errors");
// ── Validation helper ─────────────────────────────────────────────────────────
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map(e => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
// ── Per-route rate limiter ────────────────────────────────────────────────────
// Brute-force protection on the token redemption endpoint.
// 10 attempts per IP per minute — generous enough for legitimate use,
// tight enough to make token enumeration impractical.
exports.downloadRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    handler: (_req, _res, next) => {
        const { TooManyRequestsError } = require('../../../common/errors');
        next(new TooManyRequestsError('Too many download attempts. Please wait a minute.'));
    },
});
// ── Validation chains ─────────────────────────────────────────────────────────
exports.tokenParamValidation = [
    (0, express_validator_1.param)('token')
        .isString()
        .trim()
        .isLength({ min: 32, max: 200 })
        .withMessage('Invalid token format'),
];
// ── Handlers ──────────────────────────────────────────────────────────────────
// GET /api/delivery/:token
// Validates the token, enforces guards, returns a short-lived signed URL.
// requireAuth is applied at the route level — the token alone is not
// sufficient; the authenticated user must also be the token owner.
async function handleRedeemToken(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { token } = req.params;
        const result = await delivery_service_1.deliveryService.validateAndRedeem(token, req.auth.sub);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
// GET /api/delivery/my-downloads
// Returns all download tokens for the authenticated buyer.
async function handleGetMyDownloads(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const tokens = await delivery_service_1.deliveryService.getMyDownloads(req.auth.sub);
        res.json({ success: true, data: tokens });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=delivery.controller.js.map