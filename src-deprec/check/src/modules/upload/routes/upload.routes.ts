import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import { handleArtworkUpload } from '../controllers/upload.controller'

const router = Router()

// Configure multer to store files in memory as a buffer rather than writing directly to disk
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: {
    fileSize: 30 * 1024 * 1024, // Max size: 30MB
  },
})

router.use(apiRateLimit)

// Field name 'file' must strictly match form.append('file', file) from frontend
router.post(
  '/artwork',
  requireAuth,
  upload.single('file'),
  handleArtworkUpload,
)

export { router as uploadRouter }