import type { Request, Response, NextFunction } from 'express'
import { body, query, param, validationResult } from 'express-validator'
import { conversationService } from '../services/conversation.service'
import { ValidationError } from '@/common/errors'

// ── Validation chains ────────────────────────────────────────────────────────

export const createConversationValidation = [
  body('type')
    .isIn(['direct', 'broadcast'])
    .withMessage('type must be "direct" or "broadcast"'),
  body('recipient_id')
    .if(body('type').equals('direct'))
    .isUUID()
    .withMessage('recipient_id must be a valid UUID for direct conversations'),
  body('recipient_ids')
    .if(body('type').equals('broadcast'))
    .isArray({ min: 1, max: 1000 })
    .withMessage('recipient_ids must be an array of 1–1000 UUIDs'),
  body('recipient_ids.*')
    .if(body('type').equals('broadcast'))
    .isUUID()
    .withMessage('Each recipient_id must be a valid UUID'),
  body('title')
    .optional()
    .isString()
    .isLength({ max: 120 })
    .trim()
    .withMessage('title must be a string up to 120 characters'),
  body('initial_body')
    .if(body('type').equals('broadcast'))
    .isString()
    .isLength({ min: 1, max: 4000 })
    .trim()
    .withMessage('initial_body is required for broadcast conversations (max 4000 chars)'),
]

export const updateConversationValidation = [
  param('id').isUUID().withMessage('Conversation id must be a valid UUID'),
  body('title')
    .optional()
    .isString()
    .isLength({ max: 120 })
    .trim(),
]

export const listConversationsValidation = [
  query('cursor').optional().isISO8601().withMessage('cursor must be an ISO 8601 date string'),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('type').optional().isIn(['direct', 'broadcast']),
]

export const searchConversationsValidation = [
  query('q')
    .isString()
    .isLength({ min: 2, max: 100 })
    .trim()
    .withMessage('q must be 2–100 characters'),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
]

// ── Handlers ─────────────────────────────────────────────────────────────────

function assertValid(req: Request): void {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const fields = Object.fromEntries(
      errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]),
    )
    throw new ValidationError('Validation failed', fields)
  }
}

// POST /api/conversations
export async function handleCreateConversation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const userId = req.auth!.sub
    const { type, recipient_id, recipient_ids, title, initial_body } =
      req.body as {
        type:          'direct' | 'broadcast'
        recipient_id?: string
        recipient_ids?: string[]
        title?:        string
        initial_body?: string
      }

    if (type === 'direct') {
      const { conversationId } = await conversationService.getOrCreateDirect({
        initiator_id: userId,
        recipient_id: recipient_id!,
      })
      const conversation = await conversationService.getById(conversationId, userId)
      res.status(201).json({ success: true, data: conversation })
      return
    }

    // broadcast
    const convId = await conversationService.createBroadcast({
      sender_id:     userId,
      title:         title ?? null,
      recipient_ids: recipient_ids!,
      initial_body:  initial_body!,
    })

    // Send the initial broadcast message
    const { messageService } = await import('../services/message.service.js')
    await messageService.send({
      conversation_id:   convId,
      sender_id:         userId,
      body:              initial_body!,
      type:              'text',
      reply_to_id:       null,
      metadata:          {},
      client_message_id: `broadcast-init-${convId}`,
    })

    const conversation = await conversationService.getById(convId, userId)
    res.status(201).json({ success: true, data: conversation })
  } catch (err) {
    next(err)
  }
}

// GET /api/conversations
export async function handleListConversations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const userId = req.auth!.sub
    
    // FIX: Cast via unknown to bypass ParsedQs type restrictions safely
    const { cursor, limit, type } = req.query as unknown as {
      cursor?: string
      limit?:  number
      type?:   'direct' | 'broadcast'
    }

    const page = await conversationService.list({
      user_id: userId,
      // FIX: Conditional spreading to ensure undefined is never passed explicitly
      ...(cursor !== undefined ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(type !== undefined ? { type } : {}),
    })

    res.json({ success: true, data: page })
  } catch (err) {
    next(err)
  }
}

// GET /api/conversations/search
export async function handleSearchConversations(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const userId = req.auth!.sub
    
    // FIX: Cast via unknown to bypass ParsedQs type restrictions safely
    const { q, limit } = req.query as unknown as { q: string; limit?: number }

    const results = await conversationService.search({
      user_id: userId,
      query:   q,
      // FIX: Conditional spreading
      ...(limit !== undefined ? { limit } : {}),
    })

    res.json({ success: true, data: results })
  } catch (err) {
    next(err)
  }
}

// GET /api/conversations/:id
export async function handleGetConversation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId         = req.auth!.sub
    const conversationId = req.params['id']!

    const conversation = await conversationService.getById(conversationId, userId)
    res.json({ success: true, data: conversation })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/conversations/:id
export async function handleUpdateConversation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const userId         = req.auth!.sub
    const conversationId = req.params['id']!
    const { title, metadata } = req.body as { title?: string; metadata?: Record<string, unknown> }

    const updated = await conversationService.update(conversationId, userId, {
      // FIX: Conditional spreading for the update payload
      ...(title !== undefined ? { title } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    })
    
    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
}

// POST /api/conversations/:id/mute
export async function handleMuteConversation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId         = req.auth!.sub
    const conversationId = req.params['id']!
    const muted = req.body['muted'] === true

    await conversationService.setMuted(conversationId, userId, muted)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}

// DELETE /api/conversations/:id  (leave)
export async function handleLeaveConversation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId         = req.auth!.sub
    const conversationId = req.params['id']!

    await conversationService.leave(conversationId, userId)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}