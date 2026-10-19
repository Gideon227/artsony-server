import { Router } from 'express'
import { requireAuth, authorize } from '@/middleware/auth.middleware'
import { idempotencyGuard } from '@/middleware/idempotency.middleware'
import {
  handleCheckout,
  handleGetBuyerOrders,
  handleGetSellerOrders,
  handleGetOrder,
  handleConfirmPayment,
  handleCancelOrder,
  handleUpdateStatus,
  checkoutValidation,
  confirmPaymentValidation,
  orderIdValidation,
  updateStatusValidation,
  orderListValidation,
} from '../controllers/order.controller'
import {
  handleActivationSessionState,
  handleCreateActivationSession,
  handleSaveShipping,
  handleShippingLabel,
  validateOrderItem,
  validateSaveShipping,
  validateSessionState,
} from '../controllers/order-activation.controller'
import {
  handleGetSellerSale,
  handleListSellerSales,
  handleSellerSalesCounts,
} from '../controllers/seller-sales.controller'
import {
  sellerSaleDetailValidation,
  sellerSalesListValidation,
} from '../validators/seller-sales.validation'

const router = Router()

router.use(requireAuth)

// ── Checkout ─────────────────────────────────────────────────────────────────
// Idempotency is handled at the service layer via idempotency_key in the body.
router.post('/checkout', checkoutValidation, handleCheckout)

// ── Seller sales list ─────────────────────────────────────────────────────────
// Placed before /:id so Express does not match 'sales' as an id param.
router.get('/sales', orderListValidation, handleGetSellerOrders)

// ── Seller sales lines (Order Management) ─────────────────────────────────────
// One row per order item, scoped to the authenticated seller. Registered before
// /:id for the same reason as /sales above.
router.get('/sales/lines', authorize(['ARTIST', 'ADMIN']), sellerSalesListValidation, handleListSellerSales)
router.get('/sales/lines/counts', authorize(['ARTIST', 'ADMIN']), handleSellerSalesCounts)
router.get('/sales/lines/:orderItemId', authorize(['ARTIST', 'ADMIN']), sellerSaleDetailValidation, handleGetSellerSale)

// Activation: shipping choices, QR upload session and the shipping label.
router.patch('/sales/lines/:orderItemId/shipping', authorize(['ARTIST']), validateSaveShipping, handleSaveShipping)
router.post('/sales/lines/:orderItemId/activation/session', authorize(['ARTIST']), validateOrderItem, handleCreateActivationSession)
router.get(
  '/sales/lines/:orderItemId/activation/session/:sessionId',
  authorize(['ARTIST']),
  validateSessionState,
  handleActivationSessionState,
)
router.get('/sales/lines/:orderItemId/label', authorize(['ARTIST']), validateOrderItem, handleShippingLabel)

// ── Buyer order list ──────────────────────────────────────────────────────────
router.get('/', orderListValidation, handleGetBuyerOrders)

// ── Single order ──────────────────────────────────────────────────────────────
router.get('/:id', orderIdValidation, handleGetOrder)

// ── Payment confirmation ──────────────────────────────────────────────────────
// idempotencyGuard prevents a retried confirm-payment from submitting twice
// if the network drops after the server processes but before the client gets the response.
router.post('/:id/confirm-payment', idempotencyGuard(), confirmPaymentValidation, handleConfirmPayment)

// ── Cancel ────────────────────────────────────────────────────────────────────
router.post('/:id/cancel', orderIdValidation, handleCancelOrder)

// ── Status update (seller: PROCESSING → SHIPPED, admin: any) ─────────────────
router.patch('/:id/status', updateStatusValidation, handleUpdateStatus)

export { router as orderRouter }