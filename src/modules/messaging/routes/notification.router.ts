import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleListNotifications,
  handleGetUnreadCount,
  handleMarkRead,
  handleMarkAllRead,
  handleGetPreferences,
  handleUpdatePreferences,
  listNotificationsValidation,
  markReadValidation,
  updatePreferencesValidation,
} from '../controllers/notification.controller'

const router = Router()

router.use(requireAuth)
router.use(apiRateLimit)

// GET  /api/notifications
router.get('/', listNotificationsValidation, handleListNotifications)

// GET  /api/notifications/unread-count
// Must be registered before /:id to avoid param collision
router.get('/unread-count', handleGetUnreadCount)

// GET/PATCH /api/notifications/preferences
// Must be registered before /:id to avoid param collision
router.get('/preferences', handleGetPreferences)
router.patch('/preferences', updatePreferencesValidation, handleUpdatePreferences)

// POST /api/notifications/read-all
router.post('/read-all', handleMarkAllRead)

// POST /api/notifications/:id/read
router.post('/:id/read', markReadValidation, handleMarkRead)

export { router as notificationRouter }