import type { Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { reviewService } from '../services/review.service'
import { ValidationError, UnauthorizedError } from '@/common/errors'
import { compact } from '@/common/utils/object.utils'

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

// ── Validation chains ────────────────────────────────────────────────────────────

export const createReviewValidation = [
  body('order_item_id').isUUID(),
  body('rating').isInt({ min: 1, max: 5 }),
  body('comment').optional().isString().isLength({ max: 2000 }),
  body('condition_rating').optional().isInt({ min: 1, max: 5 }),
  body('delivery_rating').optional().isInt({ min: 1, max: 5 }),
]

export const listReviewsValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sort').optional().isIn(['newest', 'oldest', 'highest', 'lowest']),
  query('search').optional().isString().trim(),
]

// ── Handlers ───────────────────────────────────────────────────────────────────

export async function handleCanReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub } = requireAuth(req)
    const { orderItemId } = req.params as { orderItemId: string }
    const result = await reviewService.canReview(orderItemId, sub)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}

export async function handleCreateReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { sub } = requireAuth(req)
    const { order_item_id, rating, comment, condition_rating, delivery_rating } = req.body as {
      order_item_id: string
      rating: number
      comment?: string
      condition_rating?: number
      delivery_rating?: number
    }

    const review = await reviewService.create({
      order_item_id,
      rating,
      buyerId: sub,
      ...compact({ comment, condition_rating, delivery_rating }),
    })

    res.status(201).json({ success: true, data: review })
  } catch (err) {
    next(err)
  }
}

export async function handleListForArtwork(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { artworkId } = req.params as { artworkId: string }
    const q = req.query as Record<string, string | undefined>

    const result = await reviewService.listForArtwork(artworkId, compact({
      page:   q['page'] ? Number(q['page']) : undefined,
      limit:  q['limit'] ? Number(q['limit']) : undefined,
      sort:   q['sort'] as any,
      search: q['search'],
    }))

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

export async function handleListForSeller(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { sub } = requireAuth(req)
    const q = req.query as Record<string, string | undefined>

    const result = await reviewService.listForSeller(sub, compact({
      page:   q['page'] ? Number(q['page']) : undefined,
      limit:  q['limit'] ? Number(q['limit']) : undefined,
      sort:   q['sort'] as any,
      search: q['search'],
    }))

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}
