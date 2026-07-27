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
  getTopPicksValidation,
  handleGetSizeLabels,
  handleGetLocations,
  handleUpdateArtwork,
  handlePublishArtwork,
  handleArchiveArtwork,
  handleDeleteArtwork,
  handleFlagArtwork,
  handleToggleLike,
  createArtworkValidation,
  updateArtworkValidation,
  flagArtworkValidation,
  listArtworksValidation,
  purchasableArtworkValidation,
  featuredArtworksValidation,
  handleGetFeaturedArtworks,
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
router.get('/featured', featuredArtworksValidation, handleGetFeaturedArtworks)
router.get('/size-labels', handleGetSizeLabels)
router.get('/locations', handleGetLocations)
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