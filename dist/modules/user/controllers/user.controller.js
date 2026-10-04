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
exports.getPublicProfileValidation = exports.getInteractionPermissionsValidation = exports.updatePrivacySettingsValidation = exports.updateProfileValidation = exports.onboardingValidation = void 0;
exports.handleCompleteOnboarding = handleCompleteOnboarding;
exports.handleUpdateProfile = handleUpdateProfile;
exports.handleGetPrivacySettings = handleGetPrivacySettings;
exports.handleUpdatePrivacySettings = handleUpdatePrivacySettings;
exports.handleGetInteractionPermissions = handleGetInteractionPermissions;
exports.handleGetMe = handleGetMe;
exports.handleGetPublicProfile = handleGetPublicProfile;
exports.handleSearchUsers = handleSearchUsers;
exports.handleGetUsersByIds = handleGetUsersByIds;
const express_validator_1 = require("express-validator");
const error_middleware_1 = require("../../../middleware/error.middleware");
const errors_1 = require("../../../common/errors");
const userService = __importStar(require("../services/user.service"));
const sanitise_user_1 = require("../../../common/utils/sanitise-user");
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
const MAX_ART_FOCUS = 3;
exports.updateProfileValidation = [
    (0, express_validator_1.body)('username')
        .optional()
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be 3–30 characters'),
    (0, express_validator_1.body)('display_name')
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('Full name must be at most 100 characters'),
    (0, express_validator_1.body)('bio')
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 500 })
        .withMessage('Bio must be at most 500 characters'),
    (0, express_validator_1.body)('country')
        .optional({ nullable: true, values: 'falsy' })
        .isISO31661Alpha2()
        .withMessage('country must be a valid ISO 3166-1 alpha-2 code'),
    (0, express_validator_1.body)('state')
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('State must be at most 100 characters'),
    (0, express_validator_1.body)('city')
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('City must be at most 100 characters'),
    (0, express_validator_1.body)('interests')
        .optional()
        .isArray({ max: MAX_ART_FOCUS })
        .withMessage(`You may select at most ${MAX_ART_FOCUS} art focus tags`),
    (0, express_validator_1.body)('interests.*')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 50 }),
    // require_tld: false — these values come from our own upload endpoint's
    // response, not raw user input. In local dev without Cloudinary
    // credentials configured, the upload falls back to serving files from
    // http://localhost:PORT/uploads/..., which the default isURL() TLD
    // requirement would otherwise reject.
    (0, express_validator_1.body)('avatar_url')
        .optional({ nullable: true })
        .isURL({ require_tld: false })
        .withMessage('Invalid avatar URL'),
    (0, express_validator_1.body)('background_url')
        .optional({ nullable: true })
        .isURL({ require_tld: false })
        .withMessage('Invalid background image URL'),
    (0, express_validator_1.body)('website_url').optional({ nullable: true, values: 'falsy' }).isURL().withMessage('Invalid website URL'),
    (0, express_validator_1.body)('behance_url').optional({ nullable: true, values: 'falsy' }).isURL().withMessage('Invalid Behance URL'),
    (0, express_validator_1.body)('pinterest_url').optional({ nullable: true, values: 'falsy' }).isURL().withMessage('Invalid Pinterest URL'),
    (0, express_validator_1.body)('twitter_url').optional({ nullable: true, values: 'falsy' }).isURL().withMessage('Invalid Twitter/X URL'),
    (0, express_validator_1.body)('linkedin_url').optional({ nullable: true, values: 'falsy' }).isURL().withMessage('Invalid LinkedIn URL'),
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
            data: (0, sanitise_user_1.sanitiseUser)(user),
        });
    }
    catch (err) {
        next(err);
    }
}
// ─── PATCH /api/users/me ───────────────────────────────────────────────────────
async function handleUpdateProfile(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth) {
            res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
            return;
        }
        const body = req.body;
        const user = await userService.updateProfile({
            userId: req.auth.sub,
            input: {
                ...body,
                ...(body.country !== undefined && body.country !== null
                    ? { country: body.country.toUpperCase() }
                    : {}),
            },
        });
        res.json({
            success: true,
            data: (0, sanitise_user_1.sanitiseUser)(user),
        });
    }
    catch (err) {
        next(err);
    }
}
const PRIVACY_LEVELS = ['EVERYONE', 'FOLLOWERS', 'NO_ONE'];
exports.updatePrivacySettingsValidation = [
    (0, express_validator_1.body)('who_can_message').optional().isIn(PRIVACY_LEVELS),
    (0, express_validator_1.body)('who_can_comment').optional().isIn(PRIVACY_LEVELS),
    (0, express_validator_1.body)('who_can_purchase').optional().isIn(PRIVACY_LEVELS),
];
async function handleGetPrivacySettings(req, res, next) {
    try {
        if (!req.auth) {
            res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
            return;
        }
        const settings = await userService.getPrivacySettings(req.auth.sub);
        res.json({ success: true, data: settings });
    }
    catch (err) {
        next(err);
    }
}
async function handleUpdatePrivacySettings(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth) {
            res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
            return;
        }
        const settings = await userService.updatePrivacySettings(req.auth.sub, req.body);
        res.json({ success: true, data: settings });
    }
    catch (err) {
        next(err);
    }
}
// ─── GET /api/users/:userId/permissions ────────────────────────────────────
// Read-only preview of whether the requesting user can message/comment on/
// purchase from :userId, given :userId's privacy settings and block status.
// UI-only signal for showing/disabling buttons ahead of time — the real
// enforcement stays in message.service.ts / comment.service.ts / cart.service.ts.
exports.getInteractionPermissionsValidation = [
    (0, express_validator_1.param)('userId').isUUID().withMessage('userId must be a valid UUID'),
];
async function handleGetInteractionPermissions(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth) {
            res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
            return;
        }
        const permissions = await userService.getInteractionPermissions(req.auth.sub, req.params['userId']);
        res.json({ success: true, data: permissions });
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
        // Profile enrichment (profiles table join) must not be able to break
        // this endpoint — fall back to the bare user if it fails for any
        // reason (e.g. a pending migration).
        let fullUser = user;
        try {
            fullUser = (await userRepository.findByIdWithProfile(req.auth.sub)) ?? user;
        }
        catch (err) {
            console.error('[User] Profile enrichment failed, falling back to bare user:', err);
        }
        res.json({ success: true, data: (0, sanitise_user_1.sanitiseUser)(fullUser) });
    }
    catch (err) {
        next(err);
    }
}
// GET /api/users/:id — another user's public profile. Frontend's
// PublicProfilePage (app/(protected)/profile/[id]/page.tsx) has called this
// since it was built; no matching route ever existed, so this was a flat
// 404 for every profile, not just deactivated ones. sanitiseUser() alone
// isn't enough here — it's built for /me, where returning the caller's own
// email back to them is fine; a public profile must not include email at
// all, so that's stripped separately below.
exports.getPublicProfileValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('id must be a valid UUID'),
];
async function handleGetPublicProfile(req, res, next) {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            // Transform express-validator objects into a simple Record<string, string>
            const formattedErrors = Object.entries(errors.mapped()).reduce((acc, [field, err]) => {
                acc[field] = err.msg;
                return acc;
            }, {});
            throw new errors_1.ValidationError('Validation failed', formattedErrors);
        }
        const { userRepository } = await import('../../../modules/auth/repositories/user.repository.js');
        const user = await userRepository.findByIdWithProfile(req.params['id']);
        if (!user) {
            res.status(404).json({ success: false, code: 'NOT_FOUND' });
            return;
        }
        const { email, ...publicUser } = (0, sanitise_user_1.sanitiseUser)(user);
        res.json({ success: true, data: publicUser });
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
        res.json({ success: true, data: results.map(sanitise_user_1.sanitiseUser) });
    }
    catch (err) {
        next(err);
    }
}
// ─── GET /api/users/by-ids?ids=uuid1,uuid2 ────────────────────────────────────
// Batch profile resolver — used by the frontend to resolve collaborator ids
// (and similar id-only references) to display names/avatars in one round trip.
// Returns only public-safe fields; never email or account-security fields.
const MAX_BATCH_IDS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function handleGetUsersByIds(req, res, next) {
    try {
        if (!req.auth) {
            res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
            return;
        }
        const raw = String(req.query['ids'] ?? '');
        const ids = Array.from(new Set(raw.split(',').map((id) => id.trim()).filter(Boolean)));
        if (ids.length === 0) {
            res.json({ success: true, data: [] });
            return;
        }
        if (ids.length > MAX_BATCH_IDS) {
            throw new errors_1.ValidationError('Validation failed', { ids: `Provide at most ${MAX_BATCH_IDS} ids per request` });
        }
        const invalid = ids.filter((id) => !UUID_RE.test(id));
        if (invalid.length > 0) {
            throw new errors_1.ValidationError('Validation failed', { ids: 'All ids must be valid UUIDs' });
        }
        const { userRepository } = await import('../../../modules/auth/repositories/user.repository.js');
        const profiles = await userRepository.findPublicProfilesByIds(ids);
        res.json({ success: true, data: profiles });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=user.controller.js.map