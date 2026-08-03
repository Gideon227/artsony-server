import type { Request, Response, NextFunction } from 'express'
import { param, validationResult } from 'express-validator'
import rateLimit from 'express-rate-limit'
import { deliveryService } from '../services/delivery.service'
import { ValidationError, UnauthorizedError } from '@/common/errors'

// ── Validation helper ─────────────────────────────────────────────────────────

function assertValid(req: Request): void {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const fields = Object.fromEntries(
      errors.array().map(e => ['path' in e ? e.path : 'field', e.msg]),
    )
    throw new ValidationError('Validation failed', fields)
  }
}

// ── Per-route rate limiter ────────────────────────────────────────────────────
// Brute-force protection on the token redemption endpoint.
// 10 attempts per IP per minute — generous enough for legitimate use,
// tight enough to make token enumeration impractical.

export const downloadRateLimit = rateLimit({
  windowMs:          60 * 1000,
  max:               10,
  standardHeaders:   true,
  legacyHeaders:     false,
  skipSuccessfulRequests: false,
  handler: (_req, _res, next) => {
    const { TooManyRequestsError } = require('@/common/errors')
    next(new TooManyRequestsError('Too many download attempts. Please wait a minute.'))
  },
})

// ── Validation chains ─────────────────────────────────────────────────────────

export const tokenParamValidation = [
  param('token')
    .isString()
    .trim()
    .isLength({ min: 32, max: 200 })
    .withMessage('Invalid token format'),
]

// ── Handlers ──────────────────────────────────────────────────────────────────

// GET /api/delivery/:token
// Validates the token, enforces guards, returns a short-lived signed URL.
// requireAuth is applied at the route level — the token alone is not
// sufficient; the authenticated user must also be the token owner.
export async function handleRedeemToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const { token } = req.params as { token: string }
    const result    = await deliveryService.validateAndRedeem(token, req.auth.sub)

    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}

// GET /api/delivery/my-downloads
// Returns all download tokens for the authenticated buyer.
export async function handleGetMyDownloads(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()

    const tokens = await deliveryService.getMyDownloads(req.auth.sub)
    res.json({ success: true, data: tokens })
  } catch (err) {
    next(err)
  }
}