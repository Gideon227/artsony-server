"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moodboardRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../../middleware/rate-limit.middleware");
const moodboard_controller_1 = require("../controllers/moodboard.controller");
const router = (0, express_1.Router)();
exports.moodboardRouter = router;
router.use(rate_limit_middleware_1.apiRateLimit);
// ── Authenticated: list my own boards ─────────────────────────────────────────
// Must be registered before GET /:id or Express will try to parse "mine" (or
// whatever) as a moodboard id.
router.get('/', auth_middleware_1.requireAuth, moodboard_controller_1.handleListMoodboards);
// ── Public / Optional Auth ────────────────────────────────────────────────────
router.get('/:id', auth_middleware_1.optionalAuth, moodboard_controller_1.handleGetMoodboard);
// ── Authenticated Writes ──────────────────────────────────────────────────────
router.post('/', auth_middleware_1.requireAuth, moodboard_controller_1.createMoodboardValidation, moodboard_controller_1.handleCreateMoodboard);
router.patch('/:id', auth_middleware_1.requireAuth, moodboard_controller_1.updateMoodboardValidation, moodboard_controller_1.handleUpdateMoodboard);
router.delete('/:id', auth_middleware_1.requireAuth, moodboard_controller_1.handleDeleteMoodboard);
// ── Junction Operations (Artworks) ────────────────────────────────────────────
router.post('/:id/artworks', auth_middleware_1.requireAuth, moodboard_controller_1.artworkJunctionValidation, moodboard_controller_1.handleAddArtwork);
router.delete('/:id/artworks/:artworkId', auth_middleware_1.requireAuth, moodboard_controller_1.handleRemoveArtwork);
//# sourceMappingURL=moodboard.routes.js.map