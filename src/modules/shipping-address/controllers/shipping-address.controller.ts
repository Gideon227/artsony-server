import type { Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import { shippingAddressService } from '../services/shipping-address.service'
import { ValidationError, UnauthorizedError } from '@/common/errors'
import type { CreateShippingAddressInput } from '@/common/types/commerce.types'

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

// ── Validation chains ─────────────────────────────────────────────────────────

const addressFields = [
  body('label')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 80 })
    .trim(),
  body('full_name')
    .isString()
    .isLength({ min: 1, max: 200 })
    .trim()
    .withMessage('full_name is required'),
  body('phone')
    .isString()
    .isLength({ min: 5, max: 30 })
    .trim()
    .withMessage('phone is required'),
  body('address_line_1')
    .isString()
    .isLength({ min: 1, max: 300 })
    .trim()
    .withMessage('address_line_1 is required'),
  body('address_line_2')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 300 })
    .trim(),
  body('city')
    .isString()
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('city is required'),
  body('state')
    .isString()
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('state is required'),
  body('postal_code')
    .isString()
    .isLength({ min: 1, max: 20 })
    .trim()
    .withMessage('postal_code is required'),
  body('country_code')
    .isISO31661Alpha2()
    .withMessage('country_code must be a valid ISO 3166-1 alpha-2 code'),
  body('is_default')
    .optional()
    .isBoolean()
    .withMessage('is_default must be a boolean'),
]

export const createShippingAddressValidation = addressFields

export const updateShippingAddressValidation = [
  param('id').isUUID().withMessage('Invalid shipping address id'),
  ...addressFields.map(chain => chain.optional()),
]

export const shippingAddressIdValidation = [
  param('id').isUUID().withMessage('Invalid shipping address id'),
]

// ── Handlers ──────────────────────────────────────────────────────────────────

function buildInput(body: Record<string, any>): CreateShippingAddressInput {
  return {
    label:          body['label'] ?? null,
    full_name:      String(body['full_name']),
    phone:          String(body['phone']),
    address_line_1: String(body['address_line_1']),
    address_line_2: body['address_line_2'] ?? null,
    city:           String(body['city']),
    state:          String(body['state']),
    postal_code:    String(body['postal_code']),
    country_code:   String(body['country_code']).toUpperCase(),
    is_default:     Boolean(body['is_default'] ?? false),
  }
}

// GET /api/shipping-addresses
export async function handleList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()
    const addresses = await shippingAddressService.list(req.auth.sub)
    res.json({ success: true, data: addresses })
  } catch (err) {
    next(err)
  }
}

// GET /api/shipping-addresses/:id
export async function handleGet(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()
    const { id } = req.params as { id: string }
    const address = await shippingAddressService.get(id, req.auth.sub)
    res.json({ success: true, data: address })
  } catch (err) {
    next(err)
  }
}

// POST /api/shipping-addresses
export async function handleCreate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()
    const input   = buildInput(req.body as Record<string, any>)
    const address = await shippingAddressService.create(req.auth.sub, input)
    res.status(201).json({ success: true, data: address })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/shipping-addresses/:id
export async function handleUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()
    const { id } = req.params as { id: string }
    const b      = req.body as Record<string, any>

    const input: Partial<Omit<CreateShippingAddressInput, 'is_default'>> = {
      ...(b['label']          !== undefined && { label: b['label'] }),
      ...(b['full_name']      !== undefined && { full_name: String(b['full_name']) }),
      ...(b['phone']          !== undefined && { phone: String(b['phone']) }),
      ...(b['address_line_1'] !== undefined && { address_line_1: String(b['address_line_1']) }),
      ...(b['address_line_2'] !== undefined && { address_line_2: b['address_line_2'] }),
      ...(b['city']           !== undefined && { city: String(b['city']) }),
      ...(b['state']          !== undefined && { state: String(b['state']) }),
      ...(b['postal_code']    !== undefined && { postal_code: String(b['postal_code']) }),
      ...(b['country_code']   !== undefined && { country_code: String(b['country_code']).toUpperCase() }),
    }

    const address = await shippingAddressService.update(id, req.auth.sub, input)
    res.json({ success: true, data: address })
  } catch (err) {
    next(err)
  }
}

// POST /api/shipping-addresses/:id/default
export async function handleSetDefault(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()
    const { id } = req.params as { id: string }
    const address = await shippingAddressService.setDefault(id, req.auth.sub)
    res.json({ success: true, data: address })
  } catch (err) {
    next(err)
  }
}

// DELETE /api/shipping-addresses/:id
export async function handleDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()
    const { id } = req.params as { id: string }
    await shippingAddressService.remove(id, req.auth.sub)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}
