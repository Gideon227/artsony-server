import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleBlockUser,
  handleUnblockUser,
  handleListBlocked,
  blockUserValidation,
  listBlockedValidation,
} from '../controllers/block.controller'

const router = Router()

router.use(requireAuth)
router.use(apiRateLimit)

router.get('/', listBlockedValidation, handleListBlocked)
router.post('/:userId', blockUserValidation, handleBlockUser)
router.delete('/:userId', blockUserValidation, handleUnblockUser)

export { router as blockRouter }
