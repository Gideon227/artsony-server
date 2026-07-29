"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const idempotency_middleware_1 = require("../../../middleware/idempotency.middleware");
const order_controller_1 = require("../controllers/order.controller");
const router = (0, express_1.Router)();
exports.orderRouter = router;
router.use(auth_middleware_1.requireAuth);
// ── Checkout ─────────────────────────────────────────────────────────────────
// Idempotency is handled at the service layer via idempotency_key in the body.
router.post('/checkout', order_controller_1.checkoutValidation, order_controller_1.handleCheckout);
// ── Seller sales list ─────────────────────────────────────────────────────────
// Placed before /:id so Express does not match 'sales' as an id param.
router.get('/sales', order_controller_1.orderListValidation, order_controller_1.handleGetSellerOrders);
// ── Buyer order list ──────────────────────────────────────────────────────────
router.get('/', order_controller_1.orderListValidation, order_controller_1.handleGetBuyerOrders);
// ── Single order ──────────────────────────────────────────────────────────────
router.get('/:id', order_controller_1.orderIdValidation, order_controller_1.handleGetOrder);
// ── Payment confirmation ──────────────────────────────────────────────────────
// idempotencyGuard prevents a retried confirm-payment from submitting twice
// if the network drops after the server processes but before the client gets the response.
router.post('/:id/confirm-payment', (0, idempotency_middleware_1.idempotencyGuard)(), order_controller_1.confirmPaymentValidation, order_controller_1.handleConfirmPayment);
// ── Cancel ────────────────────────────────────────────────────────────────────
router.post('/:id/cancel', order_controller_1.orderIdValidation, order_controller_1.handleCancelOrder);
// ── Status update (seller: PROCESSING → SHIPPED, admin: any) ─────────────────
router.patch('/:id/status', order_controller_1.updateStatusValidation, order_controller_1.handleUpdateStatus);
//# sourceMappingURL=order.routes.js.map