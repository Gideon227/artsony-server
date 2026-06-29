import type { Request, Response, NextFunction } from 'express'
import { body, query, param, validationResult } from 'express-validator'
import { messageService } from '../services/message.service'
import { ValidationError } from '@/common/errors'
import { v4 as uuidv4 } from 'uuid'

// ── Validation chains ────────────────────────────────────────────────────────

export const sendMessageValidation = [
  param('id')
    .isUUID()
    .withMessage('Conversation id must be a valid UUID'),
  body('body')
    .isString()
    .isLength({ min: 1, max: 4000 })
    .trim()
    .withMessage('body is required and must be 1–4000 characters'),
  body('type')
    .optional()
    .isIn(['text', 'image', 'system'])
    .withMessage('type must be text, image, or system'),
  body('reply_to_id')
    .optional({ nullable: true })
    .isUUID()
    .withMessage('reply_to_id must be a valid UUID'),
  body('client_message_id')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('client_message_id must be a non-empty string'),
]

export const editMessageValidation = [
  param('id').isUUID().withMessage('Conversation id must be a valid UUID'),
  param('mid').isUUID().withMessage('Message id must be a valid UUID'),
  body('body')
    .isString()
    .isLength({ min: 1, max: 4000 })
    .trim()
    .withMessage('body is required and must be 1–4000 characters'),
]

export const listMessagesValidation = [
  param('id').isUUID().withMessage('Conversation id must be a valid UUID'),
  query('cursor')
    .optional()
    .isUUID()
    .withMessage('cursor must be a valid message UUID'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .toInt()
    .withMessage('limit must be between 1 and 50'),
]

export const searchMessagesValidation = [
  param('id').isUUID().withMessage('Conversation id must be a valid UUID'),
  query('q')
    .isString()
    .isLength({ min: 2, max: 100 })
    .trim()
    .withMessage('q must be 2–100 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .toInt(),
  query('cursor')
    .optional()
    .isUUID()
    .withMessage('cursor must be a valid message UUID'),
]

export const markReadValidation = [
  param('id').isUUID().withMessage('Conversation id must be a valid UUID'),
  body('up_to_message_id')
    .isUUID()
    .withMessage('up_to_message_id must be a valid UUID'),
]

// ── Handler helpers ──────────────────────────────────────────────────────────

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

// GET /api/conversations/:id/messages
export async function handleListMessages(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const userId         = req.auth!.sub
    const conversationId = req.params['id']!
    
    // FIX: Cast via unknown to bypass ParsedQs type restrictions safely
    const { cursor, limit } = req.query as unknown as {
      cursor?: string
      limit?:  number
    }

    const page = await messageService.list({
      conversation_id: conversationId,
      user_id:         userId,
      // FIX: Conditional spreading
      ...(cursor !== undefined ? { cursor } : {}),
      ...(limit !== undefined ? { limit } : {}),
    })

    res.json({ success: true, data: page })
  } catch (err) {
    next(err)
  }
}

// GET /api/conversations/:id/messages/search
export async function handleSearchMessages(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const userId         = req.auth!.sub
    const conversationId = req.params['id']!
    
    // FIX: Cast via unknown to bypass ParsedQs type restrictions safely
    const { q, limit, cursor } = req.query as unknown as {
      q:       string
      limit?:  number
      cursor?: string
    }

    const results = await messageService.search({
      conversation_id: conversationId,
      user_id:         userId,
      query:           q,
      // FIX: Conditional spreading
      ...(limit !== undefined ? { limit } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    })

    res.json({ success: true, data: results })
  } catch (err) {
    next(err)
  }
}

// POST /api/conversations/:id/messages
export async function handleSendMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const userId         = req.auth!.sub
    const conversationId = req.params['id']!
    const { body: msgBody, type, reply_to_id, metadata, client_message_id } =
      req.body as {
        body:               string
        type?:              'text' | 'image' | 'system'
        reply_to_id?:       string | null
        metadata?:          Record<string, unknown>
        client_message_id?: string
      }

    const message = await messageService.send({
      conversation_id:   conversationId,
      sender_id: userId,
      body: msgBody,
      type: type ?? 'text',
      reply_to_id: reply_to_id ?? null,
      // If the REST client did not supply a client_message_id, generate one
      // so idempotency tracking still works for this request.
      client_message_id: client_message_id ?? uuidv4(),
      ...(metadata !== undefined 
        ? { metadata: metadata as NonNullable<Parameters<typeof messageService.send>[0]['metadata']> } 
        : {}),
    })

    res.status(201).json({ success: true, data: message })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/conversations/:id/messages/:mid
export async function handleEditMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const userId    = req.auth!.sub
    const messageId = req.params['mid']!
    const { body: newBody } = req.body as { body: string }

    const updated = await messageService.edit({
      message_id: messageId,
      user_id:    userId,
      body:       newBody,
    })

    res.json({ success: true, data: updated })
  } catch (err) {
    next(err)
  }
}

// DELETE /api/conversations/:id/messages/:mid
export async function handleDeleteMessage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId    = req.auth!.sub
    const messageId = req.params['mid']!

    await messageService.delete({
      message_id: messageId,
      user_id:    userId,
    })

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}

// POST /api/conversations/:id/messages/read
export async function handleMarkRead(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const userId         = req.auth!.sub
    const conversationId = req.params['id']!
    const { up_to_message_id } = req.body as { up_to_message_id: string }

    await messageService.markRead({
      conversation_id:  conversationId,
      user_id:          userId,
      up_to_message_id,
    })

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}

// GET /api/conversations/:id/messages/:mid/reads
export async function handleGetReadReceipts(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId    = req.auth!.sub
    const messageId = req.params['mid']!

    const summary = await messageService.getReadReceipts(messageId, userId)
    res.json({ success: true, data: summary })
  } catch (err) {
    next(err)
  }
}