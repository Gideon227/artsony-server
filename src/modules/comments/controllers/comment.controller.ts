import type { Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { commentService } from '../services/comment.service'
import { ValidationError, UnauthorizedError } from '@/common/errors'

function assertValid(req: Request): void {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const fields = Object.fromEntries(
      errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg])
    )
    throw new ValidationError('Validation failed', fields)
  }
}

function requireAuth(req: Request): { sub: string } {
  if (!req.auth) throw new UnauthorizedError()
  return req.auth as { sub: string }
}

// ── Validation chains ────────────────────────────────────────────────────────

export const createCommentValidation = [
  body('artwork_id').isUUID(),
  body('body').isString().trim().isLength({ min: 1, max: 1000 }),
  body('parent_id').optional().isUUID(),
]

export const listCommentsValidation = [
  param('artworkId').isUUID(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
]

export const listRepliesValidation = [
  param('commentId').isUUID(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
]

export const deleteCommentValidation = [
  param('commentId').isUUID(),
]

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleCreateComment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { sub } = requireAuth(req)
    const { artwork_id, body: commentBody, parent_id } = req.body as {
      artwork_id: string
      body: string
      parent_id?: string
    }

    const comment = await commentService.create({ artwork_id, body: commentBody, parent_id }, sub)
    res.status(201).json({ success: true, data: comment })
  } catch (err) {
    next(err)
  }
}

export async function handleListComments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { artworkId } = req.params as { artworkId: string }
    const { page, limit } = req.query as { page?: number; limit?: number }

    const result = await commentService.listTopLevel({ artwork_id: artworkId, page, limit })
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

export async function handleListReplies(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { commentId } = req.params as { commentId: string }
    const { page, limit } = req.query as { page?: number; limit?: number }

    const result = await commentService.listReplies(commentId, { page, limit })
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

export async function handleDeleteComment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { sub } = requireAuth(req)
    const { commentId } = req.params as { commentId: string }

    await commentService.delete(commentId, sub)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}