"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.artworkRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../../middleware/rate-limit.middleware");
const artwork_controller_1 = require("../controllers/artwork.controller");
const router = (0, express_1.Router)();
exports.artworkRouter = router;
// All artwork routes count against the shared API rate limit
router.use(rate_limit_middleware_1.apiRateLimit);
// ── Public / optionally-authenticated reads ───────────────────────────────────
//
// optionalAuth: attaches req.auth if a valid token is present but never
// throws — guests can browse public artworks without a token.
router.get('/feed', artwork_controller_1.getFeedValidation, auth_middleware_1.optionalAuth, artwork_controller_1.handleGetFeed);
router.get('/top-picks', artwork_controller_1.getTopPicksValidation, artwork_controller_1.handleGetTopPicks);
router.get('/featured', artwork_controller_1.featuredArtworksValidation, artwork_controller_1.handleGetFeaturedArtworks);
router.get('/size-labels', artwork_controller_1.handleGetSizeLabels);
router.get('/locations', artwork_controller_1.handleGetLocations);
router.get('/', artwork_controller_1.listArtworksValidation, auth_middleware_1.optionalAuth, artwork_controller_1.handleListArtworks);
router.get('/by-slug/:slug', auth_middleware_1.optionalAuth, artwork_controller_1.handleGetArtworkBySlug);
// Store endpoint — no auth required, purchasability enforced by service layer.
// Placed before /:id so Express does not match 'purchasable' as an id param.
router.get('/:id/purchasable', artwork_controller_1.purchasableArtworkValidation, auth_middleware_1.optionalAuth, artwork_controller_1.handleGetPurchasableArtwork);
router.get('/:id', auth_middleware_1.optionalAuth, artwork_controller_1.handleGetArtwork);
// ── Authenticated writes ──────────────────────────────────────────────────────
router.post('/', auth_middleware_1.requireAuth, artwork_controller_1.createArtworkValidation, artwork_controller_1.handleCreateArtwork);
router.patch('/:id', auth_middleware_1.requireAuth, artwork_controller_1.updateArtworkValidation, artwork_controller_1.handleUpdateArtwork);
router.post('/:id/publish', auth_middleware_1.requireAuth, artwork_controller_1.handlePublishArtwork);
router.post('/:id/archive', auth_middleware_1.requireAuth, artwork_controller_1.handleArchiveArtwork);
router.post('/:id/like', auth_middleware_1.requireAuth, artwork_controller_1.handleToggleLike);
router.post('/:id/save', auth_middleware_1.requireAuth, artwork_controller_1.handleToggleSave);
router.post('/:id/report', auth_middleware_1.requireAuth, artwork_controller_1.reportArtworkValidation, artwork_controller_1.handleReportArtwork);
router.delete('/:id', auth_middleware_1.requireAuth, artwork_controller_1.handleDeleteArtwork);
// ── Moderation — MODERATOR or ADMIN only ──────────────────────────────────────
router.post('/:id/flag', auth_middleware_1.requireAuth, (0, auth_middleware_1.authorize)(['MODERATOR', 'ADMIN']), artwork_controller_1.flagArtworkValidation, artwork_controller_1.handleFlagArtwork);
//# sourceMappingURL=artwork.routes.js.map