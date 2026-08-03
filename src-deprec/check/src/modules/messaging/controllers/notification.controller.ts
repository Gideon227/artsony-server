import type { Request, Response, NextFunction } from 'express'
import { body, query, param, validationResult } from 'express-validator'
import { notificationService } from '../services/notification.service'
import { ValidationError } from '@/common/errors'

// ── Validation chains ────────────────────────────────────────────────────────

export const listNotificationsValidation = [
  query('cursor')
    .optional()
    .isISO8601()
    .withMessage('cursor must be a valid ISO 8601 date string'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .toInt(),
  query('unread_only')
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage('unread_only must be a boolean'),
]

export const markReadValidation = [
  param('id')
    .isUUID()
    .withMessage('Notification id must be a valid UUID'),
]

// ── Handler helper ───────────────────────────────────────────────────────────

function assertValid(req: Request): void {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const fields = Object.fromEntries(
      errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]),
    )
    throw new ValidationError('Validation failed', fields)
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

// GET /api/notifications
export async function handleListNotifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const userId = req.auth!.sub
    
    // FIX: Cast via unknown to bypass ParsedQs type restrictions safely
    const { cursor, limit, unread_only } = req.query as unknown as {
      cursor?:      string
      limit?:       number
      unread_only?: boolean
    }

    const page = await notificationService.list({
      userId,
      // FIX: Conditional spreading to satisfy exactOptionalPropertyTypes
      ...(cursor !== undefined ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(unread_only !== undefined ? { unreadOnly: unread_only } : {}),
    })

    res.json({ success: true, data: page })
  } catch (err) {
    next(err)
  }
}

// GET /api/notifications/unread-count
export async function handleGetUnreadCount(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth!.sub
    const count  = await notificationService.getUnreadCount(userId)
    res.json({ success: true, data: { unread_count: count } })
  } catch (err) {
    next(err)
  }
}

// POST /api/notifications/:id/read
export async function handleMarkRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const userId         = req.auth!.sub
    const notificationId = req.params['id']!

    await notificationService.markRead(notificationId, userId)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}

// POST /api/notifications/read-all
export async function handleMarkAllRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.auth!.sub
    await notificationService.markAllRead(userId)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}