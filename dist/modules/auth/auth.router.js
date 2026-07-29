"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const oauth_strategies_1 = require("../auth/strategies/oauth.strategies");
const auth_controller_1 = require("../auth/controllers/auth.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../middleware/rate-limit.middleware");
const token_service_1 = require("../auth/services/token.service");
const redis_client_1 = require("../redis/redis.client");
const config_1 = require("../../config");
const router = (0, express_1.Router)();
exports.authRouter = router;
// ─── Local auth ───────────────────────────────────────────────────────────────
router.post('/register', rate_limit_middleware_1.registerRateLimit, auth_controller_1.registerValidation, auth_controller_1.handleRegister);
router.post('/login', rate_limit_middleware_1.loginRateLimit, rate_limit_middleware_1.loginSlowDown, auth_controller_1.loginValidation, auth_controller_1.handleLogin);
router.post('/logout', auth_middleware_1.requireAuth, auth_controller_1.handleLogout);
router.post('/refresh', auth_controller_1.handleRefresh);
router.get('/me', auth_middleware_1.requireAuth, auth_controller_1.handleMe);
router.delete('/account', auth_middleware_1.requireAuth, auth_controller_1.handleDeleteAccount);
// ─── Password reset ───────────────────────────────────────────────────────────
router.post('/forgot-password', rate_limit_middleware_1.resetRateLimit, auth_controller_1.forgotPasswordValidation, auth_controller_1.handleForgotPassword);
router.post('/reset-password', rate_limit_middleware_1.resetPasswordRateLimit, auth_controller_1.resetPasswordValidation, auth_controller_1.handleResetPassword);
// ─── Google OAuth ─────────────────────────────────────────────────────────────
// Setup: https://console.developers.google.com
// 1. Create project → Enable "Google+ API" and "Google Identity API"
// 2. OAuth consent screen → External → add scopes: email, profile
// 3. Credentials → Create OAuth 2.0 Client ID → Web Application
// 4. Authorised redirect URIs: https://api.artsony.com/api/oauth/google/callback
// 5. Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL
router.get('/oauth/google', generateStateMiddleware, oauth_strategies_1.passport.authenticate('google', { session: false, scope: ['email', 'profile'] }));
router.get('/oauth/google/callback', validateStateMiddleware, oauth_strategies_1.passport.authenticate('google', { session: false, failureRedirect: `${config_1.config.app.frontendUrl}/login?error=oauth_failed` }), auth_controller_1.handleOAuthCallback);
// ─── Facebook OAuth ───────────────────────────────────────────────────────────
// Setup: https://developers.facebook.com
// 1. Create App → Consumer type
// 2. Add "Facebook Login" product → Settings
// 3. Valid OAuth Redirect URIs: https://api.artsony.com/api/oauth/facebook/callback
// 4. Required permissions: email, public_profile
// 5. Env vars: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_CALLBACK_URL
// Note: Apple OAuth excluded — Apple Developer license required ($99/yr)
router.get('/oauth/facebook', generateStateMiddleware, oauth_strategies_1.passport.authenticate('facebook', { session: false, scope: ['email'] }));
router.get('/oauth/facebook/callback', validateStateMiddleware, oauth_strategies_1.passport.authenticate('facebook', { session: false, failureRedirect: `${config_1.config.app.frontendUrl}/login?error=oauth_failed` }), auth_controller_1.handleOAuthCallback);
// ─── OAuth CSRF state helpers ─────────────────────────────────────────────────
async function generateStateMiddleware(req, res, next) {
    const state = (0, token_service_1.generateOAuthState)();
    await (0, redis_client_1.redisSet)(redis_client_1.RedisKeys.oauthState(state), '1', 300); // 5 min TTL
    res.cookie('oauth_state', state, {
        httpOnly: true,
        secure: config_1.config.cookie.secure,
        sameSite: 'lax',
        maxAge: 300_000,
    });
    // Attach state to query for passport
    req.query['state'] = state;
    next();
}
async function validateStateMiddleware(req, res, next) {
    const cookieState = req.cookies['oauth_state'];
    const queryState = req.query['state'];
    if (!cookieState || !queryState || cookieState !== queryState) {
        res.redirect(`${config_1.config.app.frontendUrl}/login?error=csrf_failed`);
        return;
    }
    const { redisGet, redisDel } = await import('../redis/redis.client.js');
    const stored = await redisGet(redis_client_1.RedisKeys.oauthState(queryState));
    if (!stored) {
        res.redirect(`${config_1.config.app.frontendUrl}/login?error=state_expired`);
        return;
    }
    await redisDel(redis_client_1.RedisKeys.oauthState(queryState));
    res.clearCookie('oauth_state');
    next();
}
//# sourceMappingURL=auth.router.js.map