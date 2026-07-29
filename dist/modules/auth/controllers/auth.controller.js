"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordValidation = exports.forgotPasswordValidation = exports.loginValidation = exports.registerValidation = void 0;
exports.handleRegister = handleRegister;
exports.handleLogin = handleLogin;
exports.handleRefresh = handleRefresh;
exports.handleLogout = handleLogout;
exports.handleForgotPassword = handleForgotPassword;
exports.handleResetPassword = handleResetPassword;
exports.handleDeleteAccount = handleDeleteAccount;
exports.handleMe = handleMe;
exports.handleOAuthCallback = handleOAuthCallback;
const express_validator_1 = require("express-validator");
const authService = __importStar(require("../services/auth.service"));
const error_middleware_1 = require("../../../middleware/error.middleware");
const config_1 = require("../../../config");
const errors_1 = require("../../../common/errors");
const REFRESH_COOKIE = 'artsony_rt';
// Cookie helpers
function setRefreshCookie(res, token) {
    res.cookie(REFRESH_COOKIE, token, {
        httpOnly: true,
        secure: config_1.config.cookie.secure,
        sameSite: config_1.config.cookie.sameSite,
        domain: config_1.config.cookie.domain,
        maxAge: config_1.config.jwt.refreshTokenTtl * 1000,
        path: '/api/auth',
    });
}
function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE, {
        httpOnly: true,
        secure: config_1.config.cookie.secure,
        sameSite: config_1.config.cookie.sameSite,
        path: '/api/auth',
    });
}
function getRefreshToken(req) {
    return req.cookies[REFRESH_COOKIE];
}
// ─── Input validation chains ──────────────────────────────────────────────────
exports.registerValidation = [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().trim(),
    (0, express_validator_1.body)('password').isLength({ min: 8, max: 128 }),
    (0, express_validator_1.body)('username').isLength({ min: 3, max: 30 }),
    // body('displayName').isLength({ min: 2, max: 50 }).trim().escape(),
];
exports.loginValidation = [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().trim(),
    (0, express_validator_1.body)('password').notEmpty(),
];
exports.forgotPasswordValidation = [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().trim(),
];
exports.resetPasswordValidation = [
    (0, express_validator_1.body)('token').isLength({ min: 32 }).trim(),
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().trim(),
    (0, express_validator_1.body)('newPassword').isLength({ min: 8, max: 128 }),
];
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map((e) => [
            'path' in e ? e.path : 'field',
            e.msg,
        ]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
// ─── Handlers ─────────────────────────────────────────────────────────────────
async function handleRegister(req, res, next) {
    try {
        assertValid(req);
        const { email, password, username } = req.body;
        const ctx = (0, error_middleware_1.extractRequestContext)(req);
        const { user, tokens } = await authService.register({
            email, password, username, ctx,
        });
        setRefreshCookie(res, tokens.refreshToken);
        res.status(201).json({
            success: true,
            data: {
                accessToken: tokens.accessToken,
                user: sanitiseUser(user),
            },
        });
    }
    catch (err) {
        next(err);
    }
}
async function handleLogin(req, res, next) {
    try {
        assertValid(req);
        const { email, password } = req.body;
        const ctx = (0, error_middleware_1.extractRequestContext)(req);
        const { user, tokens } = await authService.login({ email, password, ctx });
        setRefreshCookie(res, tokens.refreshToken);
        res.json({
            success: true,
            data: {
                accessToken: tokens.accessToken,
                user: sanitiseUser(user),
            },
        });
    }
    catch (err) {
        next(err);
    }
}
async function handleRefresh(req, res, next) {
    try {
        const rawToken = getRefreshToken(req);
        if (!rawToken) {
            res.status(401).json({ success: false, code: 'NO_REFRESH_TOKEN' });
            return;
        }
        const ctx = (0, error_middleware_1.extractRequestContext)(req);
        const tokens = await authService.refreshTokens({ rawRefreshToken: rawToken, ctx });
        setRefreshCookie(res, tokens.refreshToken);
        res.json({ success: true, data: { accessToken: tokens.accessToken } });
    }
    catch (err) {
        next(err);
    }
}
async function handleLogout(req, res, next) {
    try {
        const rawToken = getRefreshToken(req);
        const ctx = (0, error_middleware_1.extractRequestContext)(req);
        if (rawToken && req.auth) {
            await authService.logout({
                rawRefreshToken: rawToken,
                userId: req.auth.sub,
                ctx,
            });
        }
        clearRefreshCookie(res);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
}
async function handleForgotPassword(req, res, next) {
    try {
        assertValid(req);
        const { email } = req.body;
        const ctx = (0, error_middleware_1.extractRequestContext)(req);
        await authService.forgotPassword({ email, ctx });
        // Always 200 — never reveal if email exists
        res.json({
            success: true,
            message: 'If an account exists, a reset link has been sent.',
        });
    }
    catch (err) {
        next(err);
    }
}
async function handleResetPassword(req, res, next) {
    try {
        assertValid(req);
        const { token, email, newPassword } = req.body;
        const ctx = (0, error_middleware_1.extractRequestContext)(req);
        await authService.resetPassword({ rawToken: token, email, newPassword, ctx });
        clearRefreshCookie(res);
        res.json({ success: true, message: 'Password updated. Please sign in.' });
    }
    catch (err) {
        next(err);
    }
}
async function handleDeleteAccount(req, res, next) {
    try {
        if (!req.auth) {
            res.status(401).json({ success: false });
            return;
        }
        const { password } = req.body;
        const ctx = (0, error_middleware_1.extractRequestContext)(req);
        await authService.deleteAccount({ userId: req.auth.sub, ...(password !== undefined && { password }), ctx });
        clearRefreshCookie(res);
        res.json({ success: true, message: 'Account deletion initiated.' });
    }
    catch (err) {
        next(err);
    }
}
async function handleMe(req, res, next) {
    try {
        if (!req.auth) {
            res.status(401).json({ success: false });
            return;
        }
        const { userRepository } = await import('../repositories/user.repository.js');
        const user = await userRepository.findById(req.auth.sub);
        if (!user) {
            res.status(404).json({ success: false });
            return;
        }
        res.json({ success: true, data: sanitiseUser(user) });
    }
    catch (err) {
        next(err);
    }
}
// OAuth callbacks 
async function handleOAuthCallback(req, res, next) {
    try {
        const profile = req.user;
        const ctx = (0, error_middleware_1.extractRequestContext)(req);
        const { tokens, user, isNew } = await authService.handleOAuthProfile({ profile, ctx });
        setRefreshCookie(res, tokens.refreshToken);
        // const redirectUrl = user.onboarded
        //   ? config.app.frontendUrl
        //   : `${config.app.frontendUrl}/auth/interests`
        // const params = new URLSearchParams({
        //   access_token: tokens.accessToken,
        //   is_new: String(isNew),
        // })
        // res.redirect(`${redirectUrl}?${params.toString()}`)
        const params = new URLSearchParams({
            access_token: tokens.accessToken,
            is_new: String(isNew),
        });
        res.redirect(`${config_1.config.app.frontendUrl}/oauth/callback?${params.toString()}`);
    }
    catch (err) {
        next(err);
    }
}
// ─── Sanitise user before sending to client ───────────────────────────────────
function sanitiseUser(user) {
    const { password_hash, token_version, failed_login_attempts, locked_until, ...safe } = user;
    return safe;
}
//# sourceMappingURL=auth.controller.js.map