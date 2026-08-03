import type { Request, Response, NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import { cartService } from '../services/cart.service'
import { ValidationError, UnauthorizedError } from '@/common/errors'
import type { AddToCartInput, UpdateCartItemInput } from '@/common/types/commerce.types'

// ── Validation helper ─────────────────────────────────────────────────────────

function assertValid(req: Request): void {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const fields = Object.fromEntries(
      errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]),
    )
    throw new ValidationError('Validation failed', fields)
  }
}

// ── Validation chains ─────────────────────────────────────────────────────────

export const addItemValidation = [
  body('artwork_id')
    .isUUID()
    .withMessage('artwork_id must be a valid UUID'),
  body('quantity')
    .isInt({ min: 1, max: 100 })
    .withMessage('quantity must be an integer between 1 and 100'),
  body('variant_option_id')
    .optional()
    .isUUID()
    .withMessage('variant_option_id must be a valid UUID'),
]

export const updateItemValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid cart item id'),
  body('quantity')
    .isInt({ min: 1, max: 100 })
    .withMessage('quantity must be an integer between 1 and 100'),
]

export const removeItemValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid cart item id'),
]

// ── Handlers ──────────────────────────────────────────────────────────────────

// GET /api/cart
export async function handleGetCart(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()

    const cart = await cartService.getCart(req.auth.sub)
    res.json({ success: true, data: cart })
  } catch (err) {
    next(err)
  }
}

// POST /api/cart/items
export async function handleAddItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const b = req.body as Record<string, any>

    const input: AddToCartInput = {
      artwork_id:        String(b['artwork_id']),
      quantity:          Number(b['quantity']),
      ...(b['variant_option_id'] ? { variant_option_id: String(b['variant_option_id']) } : {}),
    }

    const cart = await cartService.addItem(req.auth.sub, input)
    res.status(201).json({ success: true, data: cart })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/cart/items/:id
export async function handleUpdateItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const { id } = req.params as { id: string }
    const input: UpdateCartItemInput = { quantity: Number(req.body['quantity']) }

    const cart = await cartService.updateQuantity(req.auth.sub, id, input)
    res.json({ success: true, data: cart })
  } catch (err) {
    next(err)
  }
}

// DELETE /api/cart/items/:id
export async function handleRemoveItem(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const { id } = req.params as { id: string }
    const cart = await cartService.removeItem(req.auth.sub, id)
    res.json({ success: true, data: cart })
  } catch (err) {
    next(err)
  }
}

// DELETE /api/cart
export async function handleClearCart(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()

    await cartService.clearCart(req.auth.sub)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}