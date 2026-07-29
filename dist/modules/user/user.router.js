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
router.get('/search', auth_middleware_1.requireAuth, user_controller_1.handleSearchUsers);
// ─── Onboarding ───────────────────────────────────────────────────────────────
// POST /api/users/onboarding — saves selected interests and marks user onboarded
// Called once from /onboarding page after registration / OAuth signup.
// Can also be called again to update interests later (idempotent).
router.post('/onboarding', user_controller_1.onboardingValidation, user_controller_1.handleCompleteOnboarding);
//# sourceMappingURL=user.router.js.map