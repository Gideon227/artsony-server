import type { Request, Response, NextFunction } from 'express'
import { param, query, validationResult } from 'express-validator'
import { blockService } from '../services/block.service'
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

export const blockUserValidation = [
  param('userId').isUUID(),
]

export const listBlockedValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
]

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleBlockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { sub } = requireAuth(req)
    const { userId } = req.params as { userId: string }

    await blockService.block(sub, userId)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}

export async function handleUnblockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { sub } = requireAuth(req)
    const { userId } = req.params as { userId: string }

    await blockService.unblock(sub, userId)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}

export async function handleListBlocked(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { sub } = requireAuth(req)
    const { page, limit } = req.query as { page?: number; limit?: number }

    const result = await blockService.listBlocked(sub, { page, limit })
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}
