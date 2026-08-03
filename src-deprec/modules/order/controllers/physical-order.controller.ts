import type { Request, Response, NextFunction } from 'express'
import { body, query, param, validationResult } from 'express-validator'
import { physicalOrderService } from '../services/physical-order.service'
import { ValidationError } from '@/common/errors'
import type { PhysicalOrderFilters, CourierServiceType, BuyerOrderView, ArtistOrderView } from '@/common/types/commerce.types'

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

// ── Role + auth extraction ────────────────────────────────────────────────────

function actor(req: Request): { actorId: string; actorRole: string } {
  return { actorId: req.auth!.sub, actorRole: req.auth!.role }
}

// ── Filter builder ────────────────────────────────────────────────────────────
// Uses exactOptionalPropertyTypes-safe construction: only assign when defined.

function buildFilters(q: Record<string, unknown>): PhysicalOrderFilters {
  const filters: PhysicalOrderFilters = {
    sort_order: q['sort_order'] === 'asc' ? 'asc' : 'desc',
    page:       q['page']  ? parseInt(q['page']  as string, 10) : 1,
    limit:      q['limit'] ? parseInt(q['limit'] as string, 10) : 20,
  }
  if (q['delivery_status'] !== undefined) filters.delivery_status = q['delivery_status'] as PhysicalOrderFilters['delivery_status']
  if (q['timeline_status'] !== undefined) filters.timeline_status = q['timeline_status'] as PhysicalOrderFilters['timeline_status']
  if (q['refund_status']   !== undefined) filters.refund_status   = q['refund_status']   as PhysicalOrderFilters['refund_status']
  if (q['courier_name']    !== undefined) filters.courier_name    = q['courier_name']    as string
  if (q['tracking_id']     !== undefined) filters.tracking_id     = q['tracking_id']     as string
  if (q['date_from']       !== undefined) filters.date_from       = q['date_from']       as string
  if (q['date_to']         !== undefined) filters.date_to         = q['date_to']         as string
  if (q['order_number']    !== undefined) filters.order_number    = q['order_number']    as string
  if (q['artist_id']       !== undefined) filters.artist_id       = q['artist_id']       as string
  if (q['buyer_id']        !== undefined) filters.buyer_id        = q['buyer_id']        as string
  return filters
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation chains
// ─────────────────────────────────────────────────────────────────────────────

export const validatePhysicalId = [
  param('physicalId').isUUID().withMessage('physicalId must be a valid UUID'),
]

export const validateArtistConfirm = [...validatePhysicalId]

export const validateActivatePickup = [
  ...validatePhysicalId,
  body('courier_name')
    .isString().trim().isLength({ min: 2, max: 120 })
    .withMessage('courier_name must be 2–120 characters'),
  body('courier_service_type')
    .isIn(['STANDARD', 'EXPRESS', 'OVERNIGHT', 'ECONOMY'])
    .withMessage('courier_service_type must be STANDARD, EXPRESS, OVERNIGHT, or ECONOMY'),
  body('shipping_cost')
    .isFloat({ min: 0 })
    .withMessage('shipping_cost must be a non-negative number'),
  body('pickup_address')
    .isString().trim().isLength({ min: 5, max: 500 })
    .withMessage('pickup_address must be 5–500 characters'),
  body('estimated_delivery_date')
    .optional()
    .isISO8601().withMessage('estimated_delivery_date must be a valid ISO 8601 date'),
]

export const validateUpdateCourierInfo = [
  ...validatePhysicalId,
  body('courier_name')
    .optional().isString().trim().isLength({ min: 2, max: 120 }),
  body('courier_service_type')
    .optional().isIn(['STANDARD', 'EXPRESS', 'OVERNIGHT', 'ECONOMY']),
  body('tracking_id')
    .optional().isString().trim().isLength({ min: 2, max: 200 }),
  body('shipping_cost')
    .optional().isFloat({ min: 0 }),
  body('estimated_delivery_date')
    .optional().isISO8601(),
  body('pickup_address')
    .optional().isString().trim().isLength({ min: 5, max: 500 }),
]

export const validateTransitUpdate = [
  ...validatePhysicalId,
  body('tracking_id').optional().isString().trim().isLength({ min: 2, max: 200 }),
  body('notes').optional().isString().trim().isLength({ max: 1000 }),
]

export const validateNotesOnly = [
  ...validatePhysicalId,
  body('notes').optional().isString().trim().isLength({ max: 1000 }),
]

export const validateFailureReason = [
  ...validatePhysicalId,
  body('reason')
    .isIn(['PICKUP_FAILED', 'COURIER_REJECTED_PICKUP'])
    .withMessage('reason must be PICKUP_FAILED or COURIER_REJECTED_PICKUP'),
  body('notes')
    .isString().trim().isLength({ min: 5, max: 1000 })
    .withMessage('notes is required (5–1000 characters)'),
]

export const validateCancelItem = [
  ...validatePhysicalId,
  body('reason')
    .isString().trim().isLength({ min: 5, max: 1000 })
    .withMessage('reason is required (5–1000 characters)'),
]

export const validateRefundRequest = [
  ...validatePhysicalId,
  body('reason')
    .isString().trim().isLength({ min: 10, max: 2000 })
    .withMessage('reason is required (10–2000 characters)'),
]

export const validateProcessRefund = [
  param('requestId').isUUID().withMessage('requestId must be a valid UUID'),
  body('decision')
    .isIn(['APPROVED', 'REJECTED'])
    .withMessage('decision must be APPROVED or REJECTED'),
  body('admin_notes').optional().isString().trim().isLength({ max: 2000 }),
  body('item_cost')
    .if(body('decision').equals('APPROVED'))
    .isFloat({ min: 0 })
    .withMessage('item_cost is required and must be non-negative when approving'),
]

export const validateDeliveryProof = [
  ...validatePhysicalId,
  body('cloudinary_public_id').isString().trim().notEmpty(),
  body('secure_url').isURL().withMessage('secure_url must be a valid URL'),
  body('mime_type').isString().trim().notEmpty(),
  body('file_size_bytes').isInt({ min: 1 }),
]

export const validateListFilters = [
  query('delivery_status').optional().isIn(['LIVE', 'DELIVERED', 'CANCELLED']),
  query('refund_status').optional().isIn(['NONE', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL']),
  query('sort_order').optional().isIn(['asc', 'desc']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('date_from').optional().isISO8601(),
  query('date_to').optional().isISO8601(),
  query('view').optional().isIn(['all', 'live', 'delivered', 'cancelled', 'pending', 'completed']),
]

export const validateUpdateShippingAddress = [
  param('orderId').isUUID().withMessage('orderId must be a valid UUID'),
  body('full_name').isString().trim().isLength({ min: 2, max: 200 }).withMessage('full_name is required'),
  body('phone').isString().trim().isLength({ min: 5, max: 30 }).withMessage('phone is required'),
  body('address_line_1').isString().trim().isLength({ min: 3, max: 300 }).withMessage('address_line_1 is required'),
  body('address_line_2').optional().isString().trim().isLength({ max: 300 }),
  body('city').isString().trim().isLength({ min: 1, max: 120 }).withMessage('city is required'),
  body('state').isString().trim().isLength({ min: 1, max: 120 }).withMessage('state is required'),
  body('postal_code').isString().trim().isLength({ min: 1, max: 30 }).withMessage('postal_code is required'),
  body('country_code').isString().trim().isLength({ min: 2, max: 2 }).withMessage('country_code must be a 2-letter ISO code'),
]

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function handleBuyerList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId } = actor(req)
    const rawView = (req.query['view'] as string | undefined) ?? 'all'
    const view: BuyerOrderView = (['all', 'live', 'delivered', 'cancelled'] as const).includes(rawView as BuyerOrderView)
      ? (rawView as BuyerOrderView)
      : 'all'
    const result = await physicalOrderService.listForBuyer(actorId, view, buildFilters(req.query as Record<string, unknown>))
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
}

export async function handleArtistList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId } = actor(req)
    const rawView = (req.query['view'] as string | undefined) ?? 'all'
    const view: ArtistOrderView = (['all', 'live', 'pending', 'completed', 'cancelled'] as const).includes(rawView as ArtistOrderView)
      ? (rawView as ArtistOrderView)
      : 'all'
    const result = await physicalOrderService.listForArtist(actorId, view, buildFilters(req.query as Record<string, unknown>))
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
}

export async function handleAdminList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const result = await physicalOrderService.adminList(buildFilters(req.query as Record<string, unknown>))
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
}

export async function handleGetOrderView(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const view = await physicalOrderService.getOrderView(req.params['physicalId']!, actorId, actorRole)
    res.json({ success: true, data: view })
  } catch (err) { next(err) }
}

export async function handleArtistConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const physical = await physicalOrderService.artistConfirm({
      physicalId: req.params['physicalId']!,
      actorId,
      actorRole,
    })
    res.json({ success: true, data: physical })
  } catch (err) { next(err) }
}

export async function handleActivatePickup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const b = req.body as {
      courier_name:            string
      courier_service_type:    CourierServiceType
      shipping_cost:           number
      pickup_address:          string
      estimated_delivery_date?: string
    }
    // Build input object exactOptionalPropertyTypes-safe
    const serviceInput: Parameters<typeof physicalOrderService.adminActivatePickup>[0] = {
      physicalId:           req.params['physicalId']!,
      actorId,
      actorRole,
      courier_name:         b.courier_name,
      courier_service_type: b.courier_service_type,
      shipping_cost:        b.shipping_cost,
      pickup_address:       b.pickup_address,
    }
    if (b.estimated_delivery_date !== undefined) {
      serviceInput.estimated_delivery_date = b.estimated_delivery_date
    }
    const physical = await physicalOrderService.adminActivatePickup(serviceInput)
    res.json({ success: true, data: physical })
  } catch (err) { next(err) }
}

export async function handleUpdateCourierInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const b = req.body as {
      courier_name?:            string
      courier_service_type?:    CourierServiceType
      tracking_id?:             string
      shipping_cost?:           number
      estimated_delivery_date?: string
      pickup_address?:          string
    }
    const serviceInput: Parameters<typeof physicalOrderService.updateCourierInfo>[0] = {
      physicalId: req.params['physicalId']!,
      actorId,
      actorRole,
    }
    if (b.courier_name            !== undefined) serviceInput.courier_name            = b.courier_name
    if (b.courier_service_type    !== undefined) serviceInput.courier_service_type    = b.courier_service_type
    if (b.tracking_id             !== undefined) serviceInput.tracking_id             = b.tracking_id
    if (b.shipping_cost           !== undefined) serviceInput.shipping_cost           = b.shipping_cost
    if (b.estimated_delivery_date !== undefined) serviceInput.estimated_delivery_date = b.estimated_delivery_date
    if (b.pickup_address          !== undefined) serviceInput.pickup_address          = b.pickup_address
    const physical = await physicalOrderService.updateCourierInfo(serviceInput)
    res.json({ success: true, data: physical })
  } catch (err) { next(err) }
}

export async function handleMarkPickedUp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const physical = await physicalOrderService.adminMarkPickedUp({
      physicalId: req.params['physicalId']!,
      actorId,
      actorRole,
    })
    res.json({ success: true, data: physical })
  } catch (err) { next(err) }
}

export async function handleMarkInTransit(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const b = req.body as { tracking_id?: string; notes?: string }
    const serviceInput: Parameters<typeof physicalOrderService.adminMarkInTransit>[0] = {
      physicalId: req.params['physicalId']!,
      actorId,
      actorRole,
    }
    if (b.tracking_id !== undefined) serviceInput.tracking_id = b.tracking_id
    if (b.notes       !== undefined) serviceInput.notes       = b.notes
    const physical = await physicalOrderService.adminMarkInTransit(serviceInput)
    res.json({ success: true, data: physical })
  } catch (err) { next(err) }
}

export async function handleMarkOutForDelivery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const physical = await physicalOrderService.adminMarkOutForDelivery({
      physicalId: req.params['physicalId']!,
      actorId,
      actorRole,
    })
    res.json({ success: true, data: physical })
  } catch (err) { next(err) }
}

export async function handleMarkDelivered(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const physical = await physicalOrderService.adminMarkDelivered({
      physicalId: req.params['physicalId']!,
      actorId,
      actorRole,
    })
    res.json({ success: true, data: physical })
  } catch (err) { next(err) }
}

export async function handleMarkDeliveryFailed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const b = req.body as { notes?: string }
    const physical = await physicalOrderService.adminMarkDeliveryFailed({
      physicalId: req.params['physicalId']!,
      actorId,
      actorRole,
      notes:      b.notes ?? 'Delivery failed',
    })
    res.json({ success: true, data: physical })
  } catch (err) { next(err) }
}

export async function handleMarkDelayed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const b = req.body as { notes?: string }
    const physical = await physicalOrderService.adminMarkDelayed({
      physicalId: req.params['physicalId']!,
      actorId,
      actorRole,
      notes:      b.notes ?? 'Delivery delayed',
    })
    res.json({ success: true, data: physical })
  } catch (err) { next(err) }
}

export async function handlePickupFailure(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const b = req.body as { reason: 'PICKUP_FAILED' | 'COURIER_REJECTED_PICKUP'; notes: string }
    const physical = await physicalOrderService.adminHandlePickupFailure({
      physicalId: req.params['physicalId']!,
      actorId,
      actorRole,
      reason:     b.reason,
      notes:      b.notes,
    })
    res.json({ success: true, data: physical })
  } catch (err) { next(err) }
}

export async function handleCancelItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const b = req.body as { reason: string }
    const physical = await physicalOrderService.cancelItem({
      physicalId: req.params['physicalId']!,
      actorId,
      actorRole,
      reason:     b.reason,
    })
    res.json({ success: true, data: physical })
  } catch (err) { next(err) }
}

export async function handleArtistRefundRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const b = req.body as { reason: string }
    const request = await physicalOrderService.artistRequestRefund({
      physicalId: req.params['physicalId']!,
      actorId,
      actorRole,
      reason:     b.reason,
    })
    res.status(201).json({ success: true, data: request })
  } catch (err) { next(err) }
}

export async function handleAdminProcessRefund(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const b = req.body as {
      decision:      'APPROVED' | 'REJECTED'
      admin_notes?:  string
      item_cost?:    number
      order_number?: string
    }
    // Build exactOptionalPropertyTypes-safe input
    const serviceInput: Parameters<typeof physicalOrderService.adminProcessRefund>[0] = {
      requestId: req.params['requestId']!,
      actorId,
      actorRole,
      decision:  b.decision,
    }
    if (b.admin_notes  !== undefined) serviceInput.admin_notes  = b.admin_notes
    if (b.item_cost    !== undefined) serviceInput.item_cost    = b.item_cost
    if (b.order_number !== undefined) serviceInput.order_number = b.order_number
    const result = await physicalOrderService.adminProcessRefund(serviceInput)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

export async function handleAdminRefundRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requests = await physicalOrderService.adminListRefundRequests()
    res.json({ success: true, data: requests })
  } catch (err) { next(err) }
}

export async function handleAddDeliveryProof(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const b = req.body as {
      cloudinary_public_id: string
      secure_url:           string
      mime_type:            string
      file_size_bytes:      number
    }
    const proof = await physicalOrderService.addDeliveryProof({
      physicalId:           req.params['physicalId']!,
      actorId,
      actorRole,
      cloudinary_public_id: b.cloudinary_public_id,
      secure_url:           b.secure_url,
      mime_type:            b.mime_type,
      file_size_bytes:      b.file_size_bytes,
    })
    res.status(201).json({ success: true, data: proof })
  } catch (err) { next(err) }
}

export async function handleDownloadInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const view = await physicalOrderService.getOrderView(
      req.params['physicalId']!,
      actorId,
      actorRole,
    )
    if (!view.invoice) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No invoice available for this order yet' })
      return
    }
    res.json({ success: true, data: { invoice_url: view.invoice.pdf_url, version: view.invoice.version } })
  } catch (err) { next(err) }
}

// GET /physical-orders/:physicalId/receipt — download payment receipt
// Distinct document from the invoice: confirms payment received
// (amount, method, transaction reference), not itemized goods/pricing.
export async function handleDownloadReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const view = await physicalOrderService.getOrderView(
      req.params['physicalId']!,
      actorId,
      actorRole,
    )
    if (!view.receipt) {
      res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No receipt available for this order yet' })
      return
    }
    res.json({ success: true, data: { receipt_url: view.receipt.pdf_url } })
  } catch (err) { next(err) }
}

// PATCH /physical-orders/:orderId/shipping-address — admin-only.
// Buyers cannot edit their own order; only the delivery address is
// mutable, and only by an admin.
export async function handleUpdateShippingAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { actorId, actorRole } = actor(req)
    const b = req.body as {
      full_name:       string
      phone:           string
      address_line_1:  string
      address_line_2?: string
      city:            string
      state:           string
      postal_code:     string
      country_code:    string
    }
    const updated = await physicalOrderService.updateShippingAddress({
      orderId:   req.params['orderId']!,
      actorId,
      actorRole,
      address: {
        full_name:      b.full_name,
        phone:          b.phone,
        address_line_1: b.address_line_1,
        address_line_2: b.address_line_2 ?? null,
        city:           b.city,
        state:          b.state,
        postal_code:    b.postal_code,
        country_code:   b.country_code,
      },
    })
    res.json({ success: true, data: updated })
  } catch (err) { next(err) }
}