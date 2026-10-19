import { Router } from 'express'
import { activationUploadRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleCompleteActivationUpload,
  handleSignActivationUpload,
  handleUploadContext,
  validateCompleteToken,
  validateSignToken,
  validateUploadToken,
} from '../controllers/order-activation.controller'

const router = Router()

// No session cookie or bearer token here: the phone that scans the QR code is
// not logged in. The one-time token in the path is the credential, it is bound
// to a single order and seller, and it expires after 15 minutes.
router.use(activationUploadRateLimit)
router.get('/:token', validateUploadToken, handleUploadContext)
router.post('/:token/sign', validateSignToken, handleSignActivationUpload)
router.post('/:token/complete', validateCompleteToken, handleCompleteActivationUpload)

export { router as activationUploadRouter }
