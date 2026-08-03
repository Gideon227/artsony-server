import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleCanReview,
  handleCreateReview,
  handleListForArtwork,
  handleListForSeller,
  createReviewValidation,
  listReviewsValidation,
} from '../controllers/review.controller'

const router = Router()

router.use(apiRateLimit)

// Public — artwork detail pages show reviews without requiring login.
router.get('/artwork/:artworkId', listReviewsValidation, handleListForArtwork)

// Authenticated — buyer eligibility, buyer create, seller's own dashboard feed.
router.get('/order-item/:orderItemId/eligibility', requireAuth, handleCanReview)
router.post('/', requireAuth, createReviewValidation, handleCreateReview)
router.get('/me/received', requireAuth, listReviewsValidation, handleListForSeller)

export { router as reviewRouter }
