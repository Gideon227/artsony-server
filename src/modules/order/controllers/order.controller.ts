import type { Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { orderService } from '../services/order.service'
import {
  ValidationError,
  UnauthorizedError,
} from '@/common/errors'
import type {
  CheckoutInput,
  ConfirmPaymentInput,
  OrderStatus,
  OrderFilters,
} from '@/common/types/commerce.types'

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

export const checkoutValidation = [
  body('cart_item_ids')
    .isArray({ min: 1 })
    .withMessage('cart_item_ids must be a non-empty array'),
  body('cart_item_ids.*')
    .isUUID()
    .withMessage('Each cart_item_id must be a valid UUID'),
  body('idempotency_key')
    .isUUID()
    .withMessage('idempotency_key must be a valid UUID'),
  body('notes')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .trim()
    .withMessage('notes cannot exceed 1000 characters'),
  // Shipping address — required for physical orders, validated if present
  body('shipping_address.full_name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 200 })
    .trim()
    .withMessage('full_name is required'),
  body('shipping_address.phone')
    .optional()
    .isString()
    .isLength({ min: 5, max: 30 })
    .withMessage('phone is required'),
  body('shipping_address.address_line_1')
    .optional()
    .isString()
    .isLength({ min: 1, max: 300 })
    .trim()
    .withMessage('address_line_1 is required'),
  body('shipping_address.address_line_2')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 300 })
    .trim(),
  body('shipping_address.city')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('city is required'),
  body('shipping_address.state')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('state is required'),
  body('shipping_address.postal_code')
    .optional()
    .isString()
    .isLength({ min: 1, max: 20 })
    .trim()
    .withMessage('postal_code is required'),
  body('shipping_address.country_code')
    .optional()
    .isISO31661Alpha2()
    .withMessage('country_code must be a valid ISO 3166-1 alpha-2 code'),
]

export const confirmPaymentValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid order id'),
  body('tx_hash')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('tx_hash is required'),
  body('sender_wallet_address')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('sender_wallet_address is required'),
  body('network')
    .isIn(['TRON', 'ETHEREUM', 'BSC'])
    .withMessage('network must be one of TRON, ETHEREUM, BSC'),
]

export const orderIdValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid order id'),
]

export const updateStatusValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid order id'),
  body('status')
    .isIn(['SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED'])
    .withMessage('status must be one of SHIPPED, COMPLETED, CANCELLED, REFUNDED'),
]

export const orderListValidation = [
  query('status')
    .optional()
    .isIn([
      'PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'PROCESSING',
      'SHIPPED', 'FULFILLED', 'COMPLETED', 'CANCELLED', 'REFUNDED',
    ])
    .withMessage('Invalid status filter'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be between 1 and 50'),
  query('sort_order')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sort_order must be asc or desc'),
]

// ── Handlers ──────────────────────────────────────────────────────────────────

// POST /api/orders/checkout
export async function handleCheckout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const b = req.body as Record<string, any>

    // FIX: Conditionally spread fields to satisfy exactOptionalPropertyTypes
    const input: CheckoutInput = {
      cart_item_ids:    (b['cart_item_ids'] as string[]).map(String),
      idempotency_key:  String(b['idempotency_key']),
      ...(b['notes'] && { notes: String(b['notes']) }),
      ...(b['shipping_address'] !== undefined && { shipping_address: b['shipping_address'] }),
    }

    const result = await orderService.initiateCheckout(req.auth.sub, input)
    res.status(201).json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}

// GET /api/orders
export async function handleGetBuyerOrders(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const q = req.query as Record<string, any>
    
    // FIX: Conditionally spread properties so undefined properties are omitted entirely
    const filters: OrderFilters = {
      ...(q['status'] && { status: q['status'] as OrderStatus }),
      ...(q['page'] && { page: Number(q['page']) }),
      ...(q['limit'] && { limit: Number(q['limit']) }),
      ...(q['sort_order'] && { sort_order: q['sort_order'] as 'asc' | 'desc' }),
    }

    const result = await orderService.getBuyerOrders(req.auth.sub, filters)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}

// GET /api/orders/sales
export async function handleGetSellerOrders(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const q = req.query as Record<string, any>
    
    // FIX: Conditionally spread properties so undefined properties are omitted entirely
    const filters: OrderFilters = {
      ...(q['status'] && { status: q['status'] as OrderStatus }),
      ...(q['page'] && { page: Number(q['page']) }),
      ...(q['limit'] && { limit: Number(q['limit']) }),
      ...(q['sort_order'] && { sort_order: q['sort_order'] as 'asc' | 'desc' }),
    }

    const result = await orderService.getSellerOrders(req.auth.sub, filters)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}

// GET /api/orders/:id
export async function handleGetOrder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const { id } = req.params as { id: string }
    const order = await orderService.getOrder(id, req.auth.sub)
    res.json({ success: true, data: order })
  } catch (err) {
    next(err)
  }
}

// POST /api/orders/:id/confirm-payment
export async function handleConfirmPayment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const { id } = req.params as { id: string }
    const b      = req.body as Record<string, any>

    const input: ConfirmPaymentInput = {
      tx_hash:               String(b['tx_hash']).trim(),
      sender_wallet_address: String(b['sender_wallet_address']).trim(),
      network:               b['network'] as 'TRON' | 'ETHEREUM' | 'BSC',
    }

    const result = await orderService.confirmPayment(id, req.auth.sub, input)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}

// POST /api/orders/:id/cancel
export async function handleCancelOrder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const { id } = req.params as { id: string }
    const order  = await orderService.cancelOrder(id, req.auth.sub)
    res.json({ success: true, data: order })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/orders/:id/status
export async function handleUpdateStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const { id } = req.params as { id: string }
    const status = String(req.body['status']) as OrderStatus

    const order = await orderService.updateOrderStatus(
      id,
      req.auth.sub,
      req.auth.role,
      status,
    )
    res.json({ success: true, data: order })
  } catch (err) {
    next(err)
  }
}