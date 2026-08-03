import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
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

const router = Router()

router.use(requireAuth)

// ── Checkout ─────────────────────────────────────────────────────────────────
// Idempotency is handled at the service layer via idempotency_key in the body.
router.post('/checkout', checkoutValidation, handleCheckout)

// ── Seller sales list ─────────────────────────────────────────────────────────
// Placed before /:id so Express does not match 'sales' as an id param.
router.get('/sales', orderListValidation, handleGetSellerOrders)

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