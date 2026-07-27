import { Router } from 'express'
import { requireAuth, optionalAuth } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleCreateMoodboard,
  handleListMoodboards,
  handleUpdateMoodboard,
  handleDeleteMoodboard,
  handleAddArtwork,
  handleRemoveArtwork,
  handleGetMoodboard,
  createMoodboardValidation,
  updateMoodboardValidation,
  artworkJunctionValidation
} from '../controllers/moodboard.controller'

const router = Router()

router.use(apiRateLimit)

// ── Authenticated: list my own boards ─────────────────────────────────────────
// Must be registered before GET /:id or Express will try to parse "mine" (or
// whatever) as a moodboard id.
router.get('/', requireAuth, handleListMoodboards)

// ── Public / Optional Auth ────────────────────────────────────────────────────
router.get('/:id', optionalAuth, handleGetMoodboard)

// ── Authenticated Writes ──────────────────────────────────────────────────────
router.post('/', requireAuth, createMoodboardValidation, handleCreateMoodboard)
router.patch('/:id', requireAuth, updateMoodboardValidation, handleUpdateMoodboard)
router.delete('/:id', requireAuth, handleDeleteMoodboard)

// ── Junction Operations (Artworks) ────────────────────────────────────────────
router.post('/:id/artworks', requireAuth, artworkJunctionValidation, handleAddArtwork)
router.delete('/:id/artworks/:artworkId', requireAuth, handleRemoveArtwork)

export { router as moodboardRouter }