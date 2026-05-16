import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleCompleteOnboarding,
  handleGetMe,
  onboardingValidation,
} from './controllers/user.controller'

const router = Router()

// All user routes require a valid access token
router.use(requireAuth)
router.use(apiRateLimit)

// ─── Profile ──────────────────────────────────────────────────────────────────

// GET /api/users/me — returns the authenticated user's profile
router.get('/me', handleGetMe)

// ─── Onboarding ───────────────────────────────────────────────────────────────

// POST /api/users/onboarding — saves selected interests and marks user onboarded
// Called once from /auth/interests page after registration / OAuth signup.
// Can also be called again to update interests later (idempotent).
router.post('/onboarding', onboardingValidation, handleCompleteOnboarding)

export { router as userRouter }