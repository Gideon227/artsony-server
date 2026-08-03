import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleCompleteOnboarding,
  handleGetMe,
  handleGetUsersByIds,
  handleSearchUsers,
  onboardingValidation,
} from './controllers/user.controller'

const router = Router()

// All user routes require a valid access token
router.use(requireAuth)
router.use(apiRateLimit)

// ─── Profile ──────────────────────────────────────────────────────────────────

// GET /api/users/me — returns the authenticated user's profile
router.get('/me', handleGetMe)
router.get('/search', requireAuth, handleSearchUsers)

// GET /api/users/by-ids?ids=uuid1,uuid2 — batch public-profile lookup
// (e.g. resolving artwork collaborator ids to display names/avatars)
router.get('/by-ids', handleGetUsersByIds)

// ─── Onboarding ───────────────────────────────────────────────────────────────

// POST /api/users/onboarding — saves selected interests and marks user onboarded
// Called once from /onboarding page after registration / OAuth signup.
// Can also be called again to update interests later (idempotent).
router.post('/onboarding', onboardingValidation, handleCompleteOnboarding)

export { router as userRouter }