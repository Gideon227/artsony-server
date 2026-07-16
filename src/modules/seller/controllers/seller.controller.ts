import type { Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import * as sellerService from '../services/seller.service'
import { extractRequestContext } from '@/middleware/error.middleware'
import { UnauthorizedError, ValidationError } from '@/common/errors'
import type {
  SubmitSellerRegistrationInput,
  UpdateSellerRegistrationInput,
  SellerRegistrationStatus,
  SellerRegistration,
} from '@/common/types/seller.types'

// ── Validation helper (mirrors auth.controller.ts / artwork.controller.ts) ────

function assertValid(req: Request): void {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const fields = Object.fromEntries(
      errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg])
    )
    throw new ValidationError('Validation failed', fields)
  }
}

// ── Validation chains ──────────────────────────────────────────────────────────

const registrationFieldValidation = [
  body('full_name')
    .isString().trim().isLength({ min: 1, max: 150 })
    .withMessage('full_name is required (max 150 characters)'),
  body('username')
    .isString().trim().isLength({ min: 3, max: 30 })
    .withMessage('username must be 3–30 characters'),
  body('email')
    .isEmail().normalizeEmail().trim()
    .withMessage('a valid email is required'),
  body('phone_number')
    .isString().trim().isLength({ min: 5, max: 30 })
    .withMessage('phone_number is required (5–30 characters)'),
  body('address')
    .isString().trim().isLength({ min: 1, max: 300 })
    .withMessage('address is required (max 300 characters)'),
  body('state')
    .isString().trim().isLength({ min: 1, max: 120 })
    .withMessage('state is required'),
  body('country')
    .isString().trim().isLength({ min: 2, max: 2 })
    .withMessage('country must be a 2-letter ISO code'),
  body('postal_code')
    .optional().isString().trim().isLength({ max: 30 }),
]

export const submitRegistrationValidation = registrationFieldValidation

export const updateRegistrationValidation = [
  body('full_name').optional().isString().trim().isLength({ min: 1, max: 150 }),
  body('username').optional().isString().trim().isLength({ min: 3, max: 30 }),
  body('email').optional().isEmail().normalizeEmail().trim(),
  body('phone_number').optional().isString().trim().isLength({ min: 5, max: 30 }),
  body('address').optional().isString().trim().isLength({ min: 1, max: 300 }),
  body('state').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('country').optional().isString().trim().isLength({ min: 2, max: 2 }),
  body('postal_code').optional().isString().trim().isLength({ max: 30 }),
]

export const idParamValidation = [
  param('id').isUUID().withMessage('id must be a valid UUID'),
]

export const reviewNotesValidation = [
  ...idParamValidation,
  body('notes').optional().isString().trim().isLength({ max: 2000 }),
]

export const listFiltersValidation = [
  query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
]

// ── Self-service handlers ──────────────────────────────────────────────────────

export async function handleSubmitRegistration(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const payload = req.body as Record<string, any>
    const input: SubmitSellerRegistrationInput = {
      full_name: String(payload['full_name']).trim(),
      username: String(payload['username']).trim(),
      email: String(payload['email']).trim(),
      phone_number: String(payload['phone_number']).trim(),
      address: String(payload['address']).trim(),
      state: String(payload['state']).trim(),
      country: String(payload['country']).trim().toUpperCase(),
      ...(payload['postal_code'] !== undefined ? { postal_code: String(payload['postal_code']).trim() } : {}),
    }

    const ctx = extractRequestContext(req)
    const registration = await sellerService.submitRegistration(req.auth.sub, input, ctx)

    res.status(201).json({ success: true, data: registration })
  } catch (err) {
    next(err)
  }
}

export async function handleGetMyRegistration(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()
    const registration = await sellerService.getMyRegistration(req.auth.sub)
    res.json({ success: true, data: registration })
  } catch (err) {
    next(err)
  }
}

export async function handleUpdateMyRegistration(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const payload = req.body as Record<string, any>
    const input: UpdateSellerRegistrationInput = {
      ...(payload['full_name'] !== undefined ? { full_name: String(payload['full_name']).trim() } : {}),
      ...(payload['username'] !== undefined ? { username: String(payload['username']).trim() } : {}),
      ...(payload['email'] !== undefined ? { email: String(payload['email']).trim() } : {}),
      ...(payload['phone_number'] !== undefined ? { phone_number: String(payload['phone_number']).trim() } : {}),
      ...(payload['address'] !== undefined ? { address: String(payload['address']).trim() } : {}),
      ...(payload['state'] !== undefined ? { state: String(payload['state']).trim() } : {}),
      ...(payload['country'] !== undefined ? { country: String(payload['country']).trim().toUpperCase() } : {}),
      ...(payload['postal_code'] !== undefined ? { postal_code: String(payload['postal_code']).trim() } : {}),
    }

    const registration = await sellerService.updateMyRegistration(req.auth.sub, input)

    res.json({ success: true, data: registration })
  } catch (err) {
    next(err)
  }
}

// ── Admin handlers ──────────────────────────────────────────────────────────────

export async function handleAdminList(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const q = req.query as Record<string, any>

    const result = await sellerService.listRegistrations({
      ...(q['status'] !== undefined ? { status: q['status'] as SellerRegistrationStatus } : {}),
      ...(q['page'] !== undefined ? { page: Number(q['page']) } : {}),
      ...(q['limit'] !== undefined ? { limit: Number(q['limit']) } : {}),
    })

    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}

export async function handleAdminGetById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const { id } = req.params as { id: string }
    const registration = await sellerService.getRegistrationById(id)
    res.json({ success: true, data: registration })
  } catch (err) {
    next(err)
  }
}

function adminActionHandler(
  action: (
    id: string,
    adminId: string,
    notes: string | undefined,
    ctx: { ipAddress: string | null; userAgent: string | null },
  ) => Promise<SellerRegistration>,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      assertValid(req)
      if (!req.auth) throw new UnauthorizedError()

      const { id } = req.params as { id: string }
      const { notes } = req.body as { notes?: string }
      const ctx = extractRequestContext(req)

      const registration = await action(id, req.auth.sub, notes, ctx)

      res.json({ success: true, data: registration })
    } catch (err) {
      next(err)
    }
  }
}

export const handleApprove = adminActionHandler(sellerService.approveRegistration)
export const handleReject = adminActionHandler(sellerService.rejectRegistration)
export const handleSuspend = adminActionHandler(sellerService.suspendRegistration)
export const handleReactivate = adminActionHandler(sellerService.reactivateRegistration)
