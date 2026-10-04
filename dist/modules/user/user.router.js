"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../middleware/rate-limit.middleware");
const user_controller_1 = require("./controllers/user.controller");
const router = (0, express_1.Router)();
exports.userRouter = router;
// All user routes require a valid access token
router.use(auth_middleware_1.requireAuth);
router.use(rate_limit_middleware_1.apiRateLimit);
// ─── Profile ──────────────────────────────────────────────────────────────────
// GET /api/users/me — returns the authenticated user's profile
router.get('/me', user_controller_1.handleGetMe);
// PATCH /api/users/me — updates username, profile fields, art focus (max 3),
// avatar/background image URLs, and social links
router.patch('/me', user_controller_1.updateProfileValidation, user_controller_1.handleUpdateProfile);
router.get('/search', auth_middleware_1.requireAuth, user_controller_1.handleSearchUsers);
// GET /api/users/by-ids?ids=uuid1,uuid2 — batch public-profile lookup
// (e.g. resolving artwork collaborator ids to display names/avatars)
router.get('/by-ids', user_controller_1.handleGetUsersByIds);
// ─── Privacy preferences ────────────────────────────────────────────────────
router.get('/me/privacy', user_controller_1.handleGetPrivacySettings);
router.patch('/me/privacy', user_controller_1.updatePrivacySettingsValidation, user_controller_1.handleUpdatePrivacySettings);
// GET /api/users/:userId/permissions — can the requesting user message/
// comment on/purchase from :userId, given :userId's privacy settings
router.get('/:userId/permissions', user_controller_1.getInteractionPermissionsValidation, user_controller_1.handleGetInteractionPermissions);
// GET /api/users/:id — another user's public profile (for PublicProfilePage).
// Must stay registered after /me, /search, /by-ids, /me/privacy above —
// as a single dynamic segment it would otherwise shadow any of those.
router.get('/:id', user_controller_1.getPublicProfileValidation, user_controller_1.handleGetPublicProfile);
// ─── Onboarding ───────────────────────────────────────────────────────────────
// POST /api/users/onboarding — saves selected interests and marks user onboarded
// Called once from /onboarding page after registration / OAuth signup.
// Can also be called again to update interests later (idempotent).
router.post('/onboarding', user_controller_1.onboardingValidation, user_controller_1.handleCompleteOnboarding);
//# sourceMappingURL=user.router.js.map