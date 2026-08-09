import type { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import { extractRequestContext } from '@/middleware/error.middleware'
import { ValidationError } from '@/common/errors'
import * as userService from '../services/user.service'
import { sanitiseUser } from '@/common/utils/sanitise-user'

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

const MAX_ART_FOCUS = 3

export const updateProfileValidation = [
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3–30 characters'),
  body('display_name')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Full name must be at most 100 characters'),
  body('bio')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio must be at most 500 characters'),
  body('location')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Location must be at most 100 characters'),
  body('interests')
    .optional()
    .isArray({ max: MAX_ART_FOCUS })
    .withMessage(`You may select at most ${MAX_ART_FOCUS} art focus tags`),
  body('interests.*')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 }),
  // require_tld: false — these values come from our own upload endpoint's
  // response, not raw user input. In local dev without Cloudinary
  // credentials configured, the upload falls back to serving files from
  // http://localhost:PORT/uploads/..., which the default isURL() TLD
  // requirement would otherwise reject.
  body('avatar_url')
    .optional({ nullable: true })
    .isURL({ require_tld: false })
    .withMessage('Invalid avatar URL'),
  body('background_url')
    .optional({ nullable: true })
    .isURL({ require_tld: false })
    .withMessage('Invalid background image URL'),
  body('website_url').optional({ nullable: true, values: 'falsy' }).isURL().withMessage('Invalid website URL'),
  body('behance_url').optional({ nullable: true, values: 'falsy' }).isURL().withMessage('Invalid Behance URL'),
  body('pinterest_url').optional({ nullable: true, values: 'falsy' }).isURL().withMessage('Invalid Pinterest URL'),
  body('twitter_url').optional({ nullable: true, values: 'falsy' }).isURL().withMessage('Invalid Twitter/X URL'),
  body('linkedin_url').optional({ nullable: true, values: 'falsy' }).isURL().withMessage('Invalid LinkedIn URL'),
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

// ─── PATCH /api/users/me ───────────────────────────────────────────────────────

export async function handleUpdateProfile(
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

    const user = await userService.updateProfile({
      userId: req.auth.sub,
      input: req.body as userService.UpdateProfileBody,
    })

    res.json({
      success: true,
      data: sanitiseUser(user),
    })
  } catch (err) {
    next(err)
  }
}

const PRIVACY_LEVELS = ['EVERYONE', 'FOLLOWERS', 'NO_ONE']

export const updatePrivacySettingsValidation = [
  body('who_can_message').optional().isIn(PRIVACY_LEVELS),
  body('who_can_comment').optional().isIn(PRIVACY_LEVELS),
  body('who_can_purchase').optional().isIn(PRIVACY_LEVELS),
]

export async function handleGetPrivacySettings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) {
      res.status(401).json({ success: false, code: 'UNAUTHORIZED' })
      return
    }
    const settings = await userService.getPrivacySettings(req.auth.sub)
    res.json({ success: true, data: settings })
  } catch (err) {
    next(err)
  }
}

export async function handleUpdatePrivacySettings(
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
    const settings = await userService.updatePrivacySettings(req.auth.sub, req.body)
    res.json({ success: true, data: settings })
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

    // Profile enrichment (profiles table join) must not be able to break
    // this endpoint — fall back to the bare user if it fails for any
    // reason (e.g. a pending migration).
    let fullUser: typeof user | Awaited<ReturnType<typeof userRepository.findByIdWithProfile>> = user
    try {
      fullUser = (await userRepository.findByIdWithProfile(req.auth.sub)) ?? user
    } catch (err) {
      console.error('[User] Profile enrichment failed, falling back to bare user:', err)
    }

    res.json({ success: true, data: sanitiseUser(fullUser) })
  } catch (err) {
    next(err)
  }
}

// ─── GET /api/users/search?q=username&limit=10 ────────────────────────────────
export async function handleSearchUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) {
      res.status(401).json({ success: false, code: 'UNAUTHORIZED' })
      return
    }

    const q = String(req.query['q'] ?? '').trim()
    const limit = Math.min(Number(req.query['limit'] ?? 10), 20)

    if (q.length < 2) {
      res.json({ success: true, data: [] })
      return
    }

    const { userRepository } = await import(
      '@/modules/auth/repositories/user.repository.js'
    )
    const results = await userRepository.searchByUsername(q, limit)
    res.json({ success: true, data: results.map(sanitiseUser) })
  } catch (err) {
    next(err)
  }
}

// ─── GET /api/users/by-ids?ids=uuid1,uuid2 ────────────────────────────────────
// Batch profile resolver — used by the frontend to resolve collaborator ids
// (and similar id-only references) to display names/avatars in one round trip.
// Returns only public-safe fields; never email or account-security fields.

const MAX_BATCH_IDS = 50
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleGetUsersByIds(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) {
      res.status(401).json({ success: false, code: 'UNAUTHORIZED' })
      return
    }

    const raw = String(req.query['ids'] ?? '')
    const ids = Array.from(new Set(raw.split(',').map((id) => id.trim()).filter(Boolean)))

    if (ids.length === 0) {
      res.json({ success: true, data: [] })
      return
    }

    if (ids.length > MAX_BATCH_IDS) {
      throw new ValidationError('Validation failed', { ids: `Provide at most ${MAX_BATCH_IDS} ids per request` })
    }

    const invalid = ids.filter((id) => !UUID_RE.test(id))
    if (invalid.length > 0) {
      throw new ValidationError('Validation failed', { ids: 'All ids must be valid UUIDs' })
    }

    const { userRepository } = await import(
      '@/modules/auth/repositories/user.repository.js'
    )
    const profiles = await userRepository.findPublicProfilesByIds(ids)
    res.json({ success: true, data: profiles })
  } catch (err) {
    next(err)
  }
}