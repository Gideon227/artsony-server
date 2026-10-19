import type { NextFunction, Request, Response } from 'express'
import { body, param } from 'express-validator'
import { UnauthorizedError } from '../../../common/errors'
import {
  SELLER_COURIERS,
  SELLER_SERVICE_TYPES,
  type SellerCourier,
  type ShippingInput,
} from '@/common/types/order-activation.types'
import type { CourierServiceType } from '../../../common/types/commerce.types'
import { orderActivationService } from '../services/order-activation.service'
import { shippingLabelService } from '../services/shipping-label.service'
import { assertValidRequest } from '../validators/seller-sales.validation'

const orderItemId = param('orderItemId').isUUID().withMessage('orderItemId must be a valid UUID')
const token = param('token')
  .isString()
  .isLength({ min: 20, max: 100 })
  .matches(/^[A-Za-z0-9_-]+$/)
  .withMessage('Invalid upload link')

export const validateSaveShipping = [
  orderItemId,
  body('courier_name').isIn([...SELLER_COURIERS]).withMessage('Choose a supported courier'),
  body('courier_service_type').isIn([...SELLER_SERVICE_TYPES]).withMessage('Choose a supported service type'),
  body('pickup_address')
    .isString()
    .trim()
    .isLength({ min: 10, max: 300 })
    .withMessage('Pickup address must be between 10 and 300 characters'),
]
export const validateOrderItem = [orderItemId]
export const validateSessionState = [orderItemId, param('sessionId').isUUID().withMessage('sessionId must be a valid UUID')]
export const validateUploadToken = [token]
export const validateSignToken = [
  token,
  body('filename').isString().trim().isLength({ min: 1, max: 255 }),
  body('file_size_bytes').isInt({ min: 1 }).withMessage('file_size_bytes must be a positive integer').toInt(),
]
export const validateCompleteToken = [
  token,
  body('public_ids').isArray({ min: 3, max: 3 }).withMessage('Exactly 3 photos are required'),
  body('public_ids.*').isString().trim().isLength({ min: 1, max: 300 }),
]

function sellerIdOf(req: Request): string {
  const sub = req.auth?.sub
  if (!sub) throw new UnauthorizedError()
  return sub
}

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store')
}

// PATCH /api/orders/sales/lines/:orderItemId/shipping
export async function handleSaveShipping(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValidRequest(req)
    const b = req.body as { courier_name: SellerCourier; courier_service_type: CourierServiceType; pickup_address: string }
    const input: ShippingInput = {
      courier_name: b.courier_name,
      courier_service_type: b.courier_service_type,
      pickup_address: b.pickup_address.trim(),
    }
    await orderActivationService.saveShipping(sellerIdOf(req), String(req.params['orderItemId']), input)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}

// POST /api/orders/sales/lines/:orderItemId/activation/session
export async function handleCreateActivationSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValidRequest(req)
    const data = await orderActivationService.createSession(sellerIdOf(req), String(req.params['orderItemId']))
    noStore(res)
    res.status(201).json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

// GET /api/orders/sales/lines/:orderItemId/activation/session/:sessionId
export async function handleActivationSessionState(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValidRequest(req)
    const data = await orderActivationService.getSessionState(
      sellerIdOf(req),
      String(req.params['orderItemId']),
      String(req.params['sessionId']),
    )
    noStore(res)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

// GET /api/orders/sales/lines/:orderItemId/label
export async function handleShippingLabel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValidRequest(req)
    const { buffer, filename } = await shippingLabelService.buildForSeller(sellerIdOf(req), String(req.params['orderItemId']))
    noStore(res)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
    res.setHeader('Content-Length', String(buffer.length))
    res.end(buffer)
  } catch (err) {
    next(err)
  }
}

// ── Public, token-authenticated (phone upload page) ──────────────────────────

// GET /api/activation-uploads/:token
export async function handleUploadContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValidRequest(req)
    const data = await orderActivationService.getUploadContext(String(req.params['token']))
    noStore(res)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

// POST /api/activation-uploads/:token/sign
export async function handleSignActivationUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValidRequest(req)
    const b = req.body as { filename: string; file_size_bytes: number }
    const data = await orderActivationService.signUpload(String(req.params['token']), b.filename, b.file_size_bytes)
    noStore(res)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

// POST /api/activation-uploads/:token/complete
export async function handleCompleteActivationUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValidRequest(req)
    const b = req.body as { public_ids: string[] }
    const data = await orderActivationService.completeUpload(String(req.params['token']), b.public_ids)
    noStore(res)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}
