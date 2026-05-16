import type { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import { extractRequestContext } from '@/middleware/error.middleware'
import { ValidationError } from '@/common/errors'
import * as userService from '../services/user.service'
import type { User } from '@/common/types'

// ─── Validation chain ─────────────────────────────────────────────────────────

export const onboardingValidation = [
  body('interests')
    .isArray({ min: 1, max: 10 })
    .withMessage('interests must be an array of 1–10 items'),
  body('interests.*')
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Each interest must be a non-empty string (max 50 chars)'),
]

function assertValid(req: Request): void {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const fields = Object.fromEntries(
      errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg])
    )
    throw new ValidationError('Validation failed', fields)
  }
}

// ─── POST /api/users/onboarding ───────────────────────────────────────────────

export async function handleCompleteOnboarding(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    assertValid(req)

    if (!req.auth) {
      res.status(401).json({ success: false, code: 'UNAUTHORIZED' })
      return
    }

    const { interests } = req.body as { interests: string[] }
    const ctx = extractRequestContext(req)

    const user = await userService.completeOnboarding({
      userId: req.auth.sub,
      interests,
      ctx,
    })

    res.json({
      success: true,
      data: sanitiseUser(user),
    })
  } catch (err) {
    next(err)
  }
}

// ─── GET /api/users/me ────────────────────────────────────────────────────────

export async function handleGetMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) {
      res.status(401).json({ success: false, code: 'UNAUTHORIZED' })
      return
    }

    const { userRepository } = await import(
      '@/modules/auth/repositories/user.repository.js'
    )
    const user = await userRepository.findById(req.auth.sub)
    if (!user) {
      res.status(404).json({ success: false, code: 'NOT_FOUND' })
      return
    }

    res.json({ success: true, data: sanitiseUser(user) })
  } catch (err) {
    next(err)
  }
}

// ─── Sanitise user before sending to client ───────────────────────────────────

function sanitiseUser(user: User) {
  const {
    password_hash,
    token_version,
    failed_login_attempts,
    locked_until,
    ...safe
  } = user
  return safe
}