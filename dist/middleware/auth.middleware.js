"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.authorize = authorize;
exports.requireOnboarded = requireOnboarded;
exports.optionalAuth = optionalAuth;
const token_service_1 = require("../modules/auth/services/token.service");
const user_repository_1 = require("../modules/auth/repositories/user.repository");
const errors_1 = require("../common/errors");
// ─── Extract Bearer token from Authorization header ───────────────────────────
function extractBearerToken(req) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer '))
        return null;
    return header.slice(7);
}
// ─── requireAuth — verifies JWT and attaches payload to req.auth ──────────────
async function requireAuth(req, res, next) {
    try {
        const token = extractBearerToken(req);
        if (!token)
            throw new errors_1.UnauthorizedError();
        const payload = await (0, token_service_1.verifyAccessToken)(token);
        // Verify token version against DB — invalidated on password change
        const user = await user_repository_1.userRepository.findById(payload.sub);
        if (!user || user.status !== 'ACTIVE')
            throw new errors_1.UnauthorizedError();
        if (user.token_version !== payload.ver)
            throw new errors_1.UnauthorizedError('Session invalidated');
        req.auth = payload;
        next();
    }
    catch (err) {
        next(err);
    }
}
// ─── authorize — role-based access control middleware factory ─────────────────
function authorize(roles) {
    return function (req, _res, next) {
        if (!req.auth) {
            return next(new errors_1.UnauthorizedError());
        }
        if (!roles.includes(req.auth.role)) {
            return next(new errors_1.ForbiddenError('Insufficient permissions'));
        }
        next();
    };
}
// ─── requireOnboarded — blocks access if user hasn't completed onboarding ─────
async function requireOnboarded(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const user = await user_repository_1.userRepository.findById(req.auth.sub);
        if (!user)
            throw new errors_1.UnauthorizedError();
        if (!user.onboarded) {
            res.status(403).json({
                code: 'ONBOARDING_REQUIRED',
                redirectTo: '/onboarding',
            });
            return;
        }
        next();
    }
    catch (err) {
        next(err);
    }
}
// ─── optionalAuth — attaches auth payload if token present, doesn't throw ─────
async function optionalAuth(req, _res, next) {
    const token = extractBearerToken(req);
    if (!token)
        return next();
    try {
        req.auth = await (0, token_service_1.verifyAccessToken)(token);
    }
    catch {
        // Silently ignore invalid token for optional auth routes
    }
    next();
}
//# sourceMappingURL=auth.middleware.js.map