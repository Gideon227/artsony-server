import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
import { uploadSignRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleCompleteUpload,
  handleDeleteUpload,
  handleSignUpload,
  validateCompleteUpload,
  validateDeleteUpload,
  validateSignUpload,
} from '../controllers/upload.controller'

const router = Router()

// Files never pass through this server: the browser uploads straight to
// Cloudinary with a signature issued by /sign, then /complete verifies the
// stored asset against the upload rules and returns the asset record.
// The general /api rate limit is already applied in app.ts.
router.post('/sign', requireAuth, uploadSignRateLimit, validateSignUpload, handleSignUpload)
router.post('/complete', requireAuth, validateCompleteUpload, handleCompleteUpload)
router.post('/delete', requireAuth, validateDeleteUpload, handleDeleteUpload)

export { router as uploadRouter }
