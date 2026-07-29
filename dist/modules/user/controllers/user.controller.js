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
exports.onboardingValidation = void 0;
exports.handleCompleteOnboarding = handleCompleteOnboarding;
exports.handleGetMe = handleGetMe;
exports.handleSearchUsers = handleSearchUsers;
const express_validator_1 = require("express-validator");
const error_middleware_1 = require("../../../middleware/error.middleware");
const errors_1 = require("../../../common/errors");
const userService = __importStar(require("../services/user.service"));
// ─── Validation chain ─────────────────────────────────────────────────────────
exports.onboardingValidation = [
    (0, express_validator_1.body)('interests')
        .isArray({ min: 1, max: 10 })
        .withMessage('interests must be an array of 1–10 items'),
    (0, express_validator_1.body)('interests.*')
        .isString()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Each interest must be a non-empty string (max 50 chars)'),
];
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
// ─── POST /api/users/onboarding ───────────────────────────────────────────────
async function handleCompleteOnboarding(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth) {
            res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
            return;
        }
        const { interests } = req.body;
        const ctx = (0, error_middleware_1.extractRequestContext)(req);
        const user = await userService.completeOnboarding({
            userId: req.auth.sub,
            interests,
            ctx,
        });
        res.json({
            success: true,
            data: sanitiseUser(user),
        });
    }
    catch (err) {
        next(err);
    }
}
// ─── GET /api/users/me ────────────────────────────────────────────────────────
async function handleGetMe(req, res, next) {
    try {
        if (!req.auth) {
            res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
            return;
        }
        const { userRepository } = await import('../../../modules/auth/repositories/user.repository.js');
        const user = await userRepository.findById(req.auth.sub);
        if (!user) {
            res.status(404).json({ success: false, code: 'NOT_FOUND' });
            return;
        }
        res.json({ success: true, data: sanitiseUser(user) });
    }
    catch (err) {
        next(err);
    }
}
// ─── GET /api/users/search?q=username&limit=10 ────────────────────────────────
async function handleSearchUsers(req, res, next) {
    try {
        if (!req.auth) {
            res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
            return;
        }
        const q = String(req.query['q'] ?? '').trim();
        const limit = Math.min(Number(req.query['limit'] ?? 10), 20);
        if (q.length < 2) {
            res.json({ success: true, data: [] });
            return;
        }
        const { userRepository } = await import('../../../modules/auth/repositories/user.repository.js');
        const results = await userRepository.searchByUsername(q, limit);
        res.json({ success: true, data: results.map(sanitiseUser) });
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
//# sourceMappingURL=user.controller.js.map