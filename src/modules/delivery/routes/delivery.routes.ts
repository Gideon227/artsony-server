import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
import {
  handleRedeemToken,
  handleGetMyDownloads,
  tokenParamValidation,
  downloadRateLimit,
} from '../controllers/delivery.controller'

const router = Router()

router.use(requireAuth)

// Placed before /:token so Express does not match 'my-downloads' as a token
router.get('/my-downloads', handleGetMyDownloads)

// Rate-limited token redemption endpoint
router.get('/:token', downloadRateLimit, tokenParamValidation, handleRedeemToken)

export { router as deliveryRouter }