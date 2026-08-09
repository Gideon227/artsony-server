import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
import {
  handleRedeemToken,
  handleGetMyDownloads,
  handleGetDownloadForOrderItem,
  tokenParamValidation,
  orderItemParamValidation,
  downloadRateLimit,
} from '../controllers/delivery.controller'

const router = Router()

router.use(requireAuth)

// Placed before /:token so Express does not match these as a token
router.get('/my-downloads', handleGetMyDownloads)
router.get(
  '/order-items/:orderItemId',
  downloadRateLimit,
  orderItemParamValidation,
  handleGetDownloadForOrderItem,
)

// Rate-limited token redemption endpoint
router.get('/:token', downloadRateLimit, tokenParamValidation, handleRedeemToken)

export { router as deliveryRouter }