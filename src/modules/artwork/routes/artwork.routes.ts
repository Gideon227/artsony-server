import { Router } from 'express'
import { requireAuth, optionalAuth, authorize } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleCreateArtwork,
  handleGetArtwork,
  handleGetArtworkBySlug,
  handleGetPurchasableArtwork,
  handleListArtworks,
  handleGetFeed,
  getFeedValidation,
  handleGetTopPicks,
  getTrendingValidation,
  handleGetTrending,
  getTopPicksValidation,
  handleGetSizeLabels,
  handleGetLocations,
  getLocationsValidation,
  handleUpdateArtwork,
  handlePublishArtwork,
  handleArchiveArtwork,
  handleDeleteArtwork,
  handleFlagArtwork,
  handleToggleLike,
  trackViewValidation,
  handleTrackView,
  createArtworkValidation,
  updateArtworkValidation,
  flagArtworkValidation,
  listArtworksValidation,
  purchasableArtworkValidation,
  featuredArtworksValidation,
  handleGetFeaturedArtworks,
  handleToggleSave,
  handleReportArtwork,
  reportArtworkValidation,
} from '../controllers/artwork.controller'

const router = Router()

// All artwork routes count against the shared API rate limit
router.use(apiRateLimit)

// ── Public / optionally-authenticated reads ───────────────────────────────────
//
// optionalAuth: attaches req.auth if a valid token is present but never
// throws — guests can browse public artworks without a token.

router.get('/feed', getFeedValidation, optionalAuth, handleGetFeed)
router.get('/top-picks', getTopPicksValidation, handleGetTopPicks)
router.get('/trending', getTrendingValidation, handleGetTrending)
router.get('/featured', featuredArtworksValidation, handleGetFeaturedArtworks)
router.get('/size-labels', handleGetSizeLabels)
router.get('/locations', getLocationsValidation, handleGetLocations)
router.get('/', listArtworksValidation, optionalAuth, handleListArtworks)
router.get('/by-slug/:slug', optionalAuth, handleGetArtworkBySlug)

// Store endpoint — no auth required, purchasability enforced by service layer.
// Placed before /:id so Express does not match 'purchasable' as an id param.
router.get(
  '/:id/purchasable',
  purchasableArtworkValidation,
  optionalAuth,
  handleGetPurchasableArtwork,
)

router.get('/:id', optionalAuth, handleGetArtwork)

// ── Authenticated writes ──────────────────────────────────────────────────────

router.post(
  '/',
  requireAuth,
  createArtworkValidation,
  handleCreateArtwork,
)

router.patch(
  '/:id',
  requireAuth,
  updateArtworkValidation,
  handleUpdateArtwork,
)

router.post(
  '/:id/publish',
  requireAuth,
  handlePublishArtwork,
)

router.post(
  '/:id/archive',
  requireAuth,
  handleArchiveArtwork,
)

router.post(
  '/:id/like',
  requireAuth,
  handleToggleLike,
)

router.post(
  '/:id/save',
  requireAuth,
  handleToggleSave,
)

// Explicit view-tracking — see handleTrackView for why this exists
// alongside the automatic tracking on GET /:id.
router.post(
  '/:id/view',
  trackViewValidation,
  optionalAuth,
  handleTrackView,
)

router.post(
  '/:id/report',
  requireAuth,
  reportArtworkValidation,
  handleReportArtwork,
)

router.delete(
  '/:id',
  requireAuth,
  handleDeleteArtwork,
)

// ── Moderation — MODERATOR or ADMIN only ──────────────────────────────────────

router.post(
  '/:id/flag',
  requireAuth,
  authorize(['MODERATOR', 'ADMIN']),
  flagArtworkValidation,
  handleFlagArtwork,
)

export { router as artworkRouter }