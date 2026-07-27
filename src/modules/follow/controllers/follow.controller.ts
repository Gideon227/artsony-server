import type { Request, Response, NextFunction } from 'express'
import { param, query, validationResult } from 'express-validator'
import { followService } from '../services/follow.service'
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

export const toggleFollowValidation = [
    param('userId').isUUID(),
]

export const listFollowValidation = [
    param('userId').isUUID(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
]

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleToggleFollow(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        assertValid(req)
        const { sub } = requireAuth(req)
        const { userId } = req.params as { userId: string }

        const result = await followService.toggle(sub, userId)
        res.json({ success: true, data: result })
    } catch (err) {
        next(err)
    }
}

export async function handleIsFollowing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        assertValid(req)
        const { sub } = requireAuth(req)
        const { userId } = req.params as { userId: string }

        const is_following = await followService.isFollowing(sub, userId)
        res.json({ success: true, data: { is_following } })
    } catch (err) {
        next(err)
    }
}

export async function handleListFollowers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        assertValid(req)
        const { userId } = req.params as { userId: string }
        const { page, limit } = req.query as { page?: number; limit?: number }

        const result = await followService.listFollowers(userId, { page, limit })
        res.json({ success: true, ...result })
    } catch (err) {
        next(err)
    }
}

export async function handleListFollowing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        assertValid(req)
        const { userId } = req.params as { userId: string }
        const { page, limit } = req.query as { page?: number; limit?: number }

        const result = await followService.listFollowing(userId, { page, limit })
        res.json({ success: true, ...result })
    } catch (err) {
        next(err)
    }
}