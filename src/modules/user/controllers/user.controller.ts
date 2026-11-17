import type { Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import { extractRequestContext } from '@/middleware/error.middleware'
import { ValidationError } from '@/common/errors'
import * as userService from '../services/user.service'
import { sanitiseUser } from '@/common/utils/sanitise-user'
import { PRIVATE_DETAIL_KEYS, type PrivateDetails } from '../repositories/private-details.repository'
import type { PrivacySettings } from '@/common/types'

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
  body('country')
    .optional({ nullable: true, values: 'falsy' })
    .isISO31661Alpha2()
    .withMessage('country must be a valid ISO 3166-1 alpha-2 code'),
  body('state')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('State must be at most 100 characters'),
  body('city')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('City must be at most 100 characters'),
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

    const body = req.body as userService.UpdateProfileBody
    const user = await userService.updateProfile({
      userId: req.auth.sub,
      input: {
        ...body,
        ...(body.country !== undefined && body.country !== null
          ? { country: body.country.toUpperCase() }
          : {}),
      },
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
    // Whitelist the three known keys — the body used to be spread straight
    // into the profiles UPDATE, so any other column name in the request
    // (e.g. followers_count) would have been written too.
    const { who_can_message, who_can_comment, who_can_purchase } = req.body as Partial<PrivacySettings>
    const changes: Partial<PrivacySettings> = {
      ...(who_can_message !== undefined && { who_can_message }),
      ...(who_can_comment !== undefined && { who_can_comment }),
      ...(who_can_purchase !== undefined && { who_can_purchase }),
    }
    const settings = await userService.updatePrivacySettings(req.auth.sub, changes)
    res.json({ success: true, data: settings })
  } catch (err) {
    next(err)
  }
}

// ─── Private details: phone number + billing address ─────────────────────────
// GET/PATCH /api/users/me/private-details — only ever the caller's own row.

export const updatePrivateDetailsValidation = [
  // Stored as E.164 ("+2348012345678"). Empty string / null clears it.
  body('phone_number')
    .optional({ nullable: true, values: 'falsy' })
    .trim()
    .matches(/^\+[1-9]\d{6,14}$/)
    .withMessage('Phone number must be in international format, e.g. +2348012345678'),
  body('billing_address').optional({ nullable: true }).trim().isLength({ max: 300 })
    .withMessage('Address must be at most 300 characters'),
  body('billing_city').optional({ nullable: true }).trim().isLength({ max: 100 })
    .withMessage('City must be at most 100 characters'),
  body('billing_state').optional({ nullable: true }).trim().isLength({ max: 100 })
    .withMessage('State must be at most 100 characters'),
  body('billing_postal_code').optional({ nullable: true }).trim().isLength({ max: 20 })
    .withMessage('Postal code must be at most 20 characters'),
  body('billing_country_code')
    .optional({ nullable: true, values: 'falsy' })
    .isISO31661Alpha2()
    .withMessage('Country must be a valid ISO 3166-1 alpha-2 code'),
]

export async function handleGetPrivateDetails(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) {
      res.status(401).json({ success: false, code: 'UNAUTHORIZED' })
      return
    }
    const details = await userService.getPrivateDetails(req.auth.sub)
    res.json({ success: true, data: details })
  } catch (err) {
    next(err)
  }
}

export async function handleUpdatePrivateDetails(
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

    // Only known keys, and only the ones actually sent — so saving the phone
    // never blanks the billing address. '' and null both mean "clear".
    const body = req.body as Record<string, unknown>
    const changes: Partial<PrivateDetails> = {}
    for (const key of PRIVATE_DETAIL_KEYS) {
      const value = body[key]
      if (value === undefined) continue
      const text = typeof value === 'string' ? value.trim() : ''
      changes[key] = text === '' ? null : key === 'billing_country_code' ? text.toUpperCase() : text
    }

    const details = await userService.updatePrivateDetails(req.auth.sub, changes)
    res.json({ success: true, data: details })
  } catch (err) {
    next(err)
  }
}

// ─── GET /api/users/:userId/permissions ────────────────────────────────────
// Read-only preview of whether the requesting user can message/comment on/
// purchase from :userId, given :userId's privacy settings and block status.
// UI-only signal for showing/disabling buttons ahead of time — the real
// enforcement stays in message.service.ts / comment.service.ts / cart.service.ts.

export const getInteractionPermissionsValidation = [
  param('userId').isUUID().withMessage('userId must be a valid UUID'),
]

export async function handleGetInteractionPermissions(
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
    const permissions = await userService.getInteractionPermissions(
      req.auth.sub,
      req.params['userId'] as string,
    )
    res.json({ success: true, data: permissions })
  } catch (err) {
    next(err)
  }
}

export const reportUserValidation = [
  param('id').isUUID().withMessage('id must be a valid UUID'),
  body('reason').isIn([...userService.USER_REPORT_REASONS]).withMessage('Invalid report reason'),
  body('notes').optional().isString().trim().isLength({ max: 1000 }),
  body('conversation_id').optional().isUUID().withMessage('conversation_id must be a valid UUID'),
]

export async function handleReportUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) { res.status(401).json({ success: false, code: 'UNAUTHORIZED' }); return }
    const { id } = req.params as { id: string }
    const { reason, notes, conversation_id } = req.body as { reason: userService.UserReportReason; notes?: string; conversation_id?: string }
    await userService.reportUser({ reporterId: req.auth.sub, reportedUserId: id, reason, notes, conversationId: conversation_id })
    res.status(201).json({ success: true, message: 'Report submitted' })
  } catch (err) { next(err) }
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

// GET /api/users/:id — another user's public profile. Frontend's
// PublicProfilePage (app/(protected)/profile/[id]/page.tsx) has called this
// since it was built; no matching route ever existed, so this was a flat
// 404 for every profile, not just deactivated ones. sanitiseUser() alone
// isn't enough here — it's built for /me, where returning the caller's own
// email back to them is fine; a public profile must not include email at
// all, so that's stripped separately below.
export const getPublicProfileValidation = [
  param('id').isUUID().withMessage('id must be a valid UUID'),
]

export async function handleGetPublicProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      // Transform express-validator objects into a simple Record<string, string>
      const formattedErrors = Object.entries(errors.mapped()).reduce((acc, [field, err]) => {
        acc[field] = err.msg as string
        return acc
      }, {} as Record<string, string>)

      throw new ValidationError('Validation failed', formattedErrors)
    }

    const { userRepository } = await import(
      '@/modules/auth/repositories/user.repository.js'
    )
    const user = await userRepository.findByIdWithProfile(req.params['id'] as string)
    
    if (!user) {
      res.status(404).json({ success: false, code: 'NOT_FOUND' })
      return
    }

    const { email, ...publicUser } = sanitiseUser(user)
    res.json({ success: true, data: publicUser })
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

// ─── GET /api/users/search/public?q=name&limit=8 ──────────────────────────────
// Public-safe user search for pickers (e.g. tagging collaborators on upload).
// Unlike /search, this matches display names too, excludes the caller, and
// only returns public profile fields (no email / account-security fields).
export async function handleSearchPublicUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) {
      res.status(401).json({ success: false, code: 'UNAUTHORIZED' })
      return
    }

    const q = String(req.query['q'] ?? '').trim().slice(0, 50)
    const requested = Number(req.query['limit'] ?? 8)
    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 8, 1), 20)

    if (q.length < 2) {
      res.json({ success: true, data: [] })
      return
    }

    const { userRepository } = await import(
      '@/modules/auth/repositories/user.repository.js'
    )
    const results = await userRepository.searchPublicProfiles(q, limit, req.auth.sub)
    res.json({ success: true, data: results })
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