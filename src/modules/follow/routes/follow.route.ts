import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleToggleFollow,
  handleIsFollowing,
  handleListFollowers,
  handleListFollowing,
  toggleFollowValidation,
  listFollowValidation,
} from '../controllers/follow.controller'

const router = Router()

router.use(apiRateLimit)

// Public — anyone can see who follows / is followed by a user.
router.get('/:userId/followers', listFollowValidation, handleListFollowers)
router.get('/:userId/following', listFollowValidation, handleListFollowing)

// Authenticated
router.get('/:userId/is-following', requireAuth, toggleFollowValidation, handleIsFollowing)
router.post('/:userId/toggle', requireAuth, toggleFollowValidation, handleToggleFollow)

export { router as followRouter }