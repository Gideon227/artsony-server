import { Router } from 'express'
import { requireAuth, authorize } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleBuyerList,
  handleArtistList,
  handleAdminList,
  handleGetOrderView,
  handleArtistConfirm,
  handleActivatePickup,
  handleUpdateCourierInfo,
  handleMarkPickedUp,
  handleMarkInTransit,
  handleMarkOutForDelivery,
  handleMarkDelivered,
  handleMarkDeliveryFailed,
  handleMarkDelayed,
  handlePickupFailure,
  handleCancelItem,
  handleArtistRefundRequest,
  handleAdminProcessRefund,
  handleAdminRefundRequests,
  handleAddDeliveryProof,
  handleDownloadInvoice,
  handleDownloadReceipt,
  handleUpdateShippingAddress,
  validatePhysicalId,
  validateArtistConfirm,
  validateActivatePickup,
  validateUpdateCourierInfo,
  validateTransitUpdate,
  validateNotesOnly,
  validateFailureReason,
  validateCancelItem,
  validateRefundRequest,
  validateProcessRefund,
  validateDeliveryProof,
  validateListFilters,
  validateUpdateShippingAddress,
} from '../controllers/physical-order.controller'

const router = Router()

// All physical-order routes require a valid access token
router.use(requireAuth)
router.use(apiRateLimit)

// ── Buyer routes ──────────────────────────────────────────────────────────────

// GET  /api/physical-orders/buyer
//      Buyer lists all their physical order items (filterable)
router.get(
  '/buyer',
  authorize(['USER', 'ADMIN']),
  validateListFilters,
  handleBuyerList,
)

// ── Artist routes ─────────────────────────────────────────────────────────────

// GET  /api/physical-orders/artist
//      Artist lists all physical items from their orders
router.get(
  '/artist',
  authorize(['ARTIST', 'ADMIN']),
  validateListFilters,
  handleArtistList,
)

// GET  /api/physical-orders/admin
//      Admin paginated list of all physical order items
router.get(
  '/admin',
  authorize(['ADMIN']),
  validateListFilters,
  handleAdminList,
)

// GET  /api/physical-orders/refund-requests
//      Admin views all PENDING_ADMIN refund requests
router.get(
  '/refund-requests',
  authorize(['ADMIN']),
  handleAdminRefundRequests,
)

// POST /api/physical-orders/:physicalId/confirm
//      Artist confirms they will fulfil the order
router.post(
  '/:physicalId/confirm',
  authorize(['ARTIST', 'ADMIN']),
  validateArtistConfirm,
  handleArtistConfirm,
)

// POST /api/physical-orders/:physicalId/refund-request
//      Artist submits a refund request for admin to review
router.post(
  '/:physicalId/refund-request',
  authorize(['ARTIST']),
  validateRefundRequest,
  handleArtistRefundRequest,
)

// ── Shared buyer + artist routes ──────────────────────────────────────────────

// GET  /api/physical-orders/:physicalId
//      View full order item details (scoped per role in service layer)
router.get(
  '/:physicalId',
  authorize(['USER', 'ARTIST', 'ADMIN']),
  validatePhysicalId,
  handleGetOrderView,
)

// POST /api/physical-orders/:physicalId/cancel
//      Buyer or artist cancels (only within AWAITING_CONFIRMATION window)
//      Admin can cancel from any non-delivered state
router.post(
  '/:physicalId/cancel',
  authorize(['USER', 'ARTIST', 'ADMIN']),
  validateCancelItem,
  handleCancelItem,
)

// GET  /api/physical-orders/:physicalId/invoice
//      Download latest invoice URL (buyer, artist, or admin)
router.get(
  '/:physicalId/invoice',
  authorize(['USER', 'ARTIST', 'ADMIN']),
  validatePhysicalId,
  handleDownloadInvoice,
)

// GET  /api/physical-orders/:physicalId/receipt
//      Download payment receipt (buyer, artist, or admin) — proof of
//      payment, distinct from the itemized invoice above.
router.get(
  '/:physicalId/receipt',
  authorize(['USER', 'ARTIST', 'ADMIN']),
  validatePhysicalId,
  handleDownloadReceipt,
)

// ── Admin-only routes ─────────────────────────────────────────────────────────

// PATCH /api/physical-orders/:orderId/shipping-address
//       Admin-only. Buyers cannot edit their own order; only the delivery
//       address is mutable, and only by an admin.
router.patch(
  '/:orderId/shipping-address',
  authorize(['ADMIN']),
  validateUpdateShippingAddress,
  handleUpdateShippingAddress,
)

// POST /api/physical-orders/refund-requests/:requestId/process
//      Admin approves or rejects a refund request
router.post(
  '/refund-requests/:requestId/process',
  authorize(['ADMIN']),
  validateProcessRefund,
  handleAdminProcessRefund,
)

// POST /api/physical-orders/:physicalId/activate-pickup
//      Admin assigns courier and activates pickup
router.post(
  '/:physicalId/activate-pickup',
  authorize(['ADMIN']),
  validateActivatePickup,
  handleActivatePickup,
)

// PATCH /api/physical-orders/:physicalId/courier
//       Admin updates courier name, type, tracking_id at any live stage
router.patch(
  '/:physicalId/courier',
  authorize(['ADMIN']),
  validateUpdateCourierInfo,
  handleUpdateCourierInfo,
)

// POST /api/physical-orders/:physicalId/picked-up
router.post(
  '/:physicalId/picked-up',
  authorize(['ADMIN']),
  validateNotesOnly,
  handleMarkPickedUp,
)

// POST /api/physical-orders/:physicalId/in-transit
router.post(
  '/:physicalId/in-transit',
  authorize(['ADMIN']),
  validateTransitUpdate,
  handleMarkInTransit,
)

// POST /api/physical-orders/:physicalId/out-for-delivery
router.post(
  '/:physicalId/out-for-delivery',
  authorize(['ADMIN']),
  validateNotesOnly,
  handleMarkOutForDelivery,
)

// POST /api/physical-orders/:physicalId/delivered
router.post(
  '/:physicalId/delivered',
  authorize(['ADMIN']),
  validateNotesOnly,
  handleMarkDelivered,
)

// POST /api/physical-orders/:physicalId/delivery-failed
router.post(
  '/:physicalId/delivery-failed',
  authorize(['ADMIN']),
  validateNotesOnly,
  handleMarkDeliveryFailed,
)

// POST /api/physical-orders/:physicalId/delayed
router.post(
  '/:physicalId/delayed',
  authorize(['ADMIN']),
  validateNotesOnly,
  handleMarkDelayed,
)

// POST /api/physical-orders/:physicalId/pickup-failure
router.post(
  '/:physicalId/pickup-failure',
  authorize(['ADMIN']),
  validateFailureReason,
  handlePickupFailure,
)

// POST /api/physical-orders/:physicalId/delivery-proof
//      Admin uploads immutable delivery proof image (metadata only — Cloudinary upload
//      is done client-side via signed URL; this endpoint records the result)
router.post(
  '/:physicalId/delivery-proof',
  authorize(['ADMIN']),
  validateDeliveryProof,
  handleAddDeliveryProof,
)

export { router as physicalOrderRouter }