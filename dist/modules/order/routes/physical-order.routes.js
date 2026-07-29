"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.physicalOrderRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../../middleware/rate-limit.middleware");
const physical_order_controller_1 = require("../controllers/physical-order.controller");
const router = (0, express_1.Router)();
exports.physicalOrderRouter = router;
// All physical-order routes require a valid access token
router.use(auth_middleware_1.requireAuth);
router.use(rate_limit_middleware_1.apiRateLimit);
// ── Buyer routes ──────────────────────────────────────────────────────────────
// GET  /api/physical-orders/buyer
//      Buyer lists all their physical order items (filterable)
router.get('/buyer', (0, auth_middleware_1.authorize)(['USER', 'ADMIN']), physical_order_controller_1.validateListFilters, physical_order_controller_1.handleBuyerList);
// ── Artist routes ─────────────────────────────────────────────────────────────
// GET  /api/physical-orders/artist
//      Artist lists all physical items from their orders
router.get('/artist', (0, auth_middleware_1.authorize)(['ARTIST', 'ADMIN']), physical_order_controller_1.validateListFilters, physical_order_controller_1.handleArtistList);
// GET  /api/physical-orders/admin
//      Admin paginated list of all physical order items
router.get('/admin', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.validateListFilters, physical_order_controller_1.handleAdminList);
// GET  /api/physical-orders/refund-requests
//      Admin views all PENDING_ADMIN refund requests
router.get('/refund-requests', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.handleAdminRefundRequests);
// POST /api/physical-orders/:physicalId/confirm
//      Artist confirms they will fulfil the order
router.post('/:physicalId/confirm', (0, auth_middleware_1.authorize)(['ARTIST', 'ADMIN']), physical_order_controller_1.validateArtistConfirm, physical_order_controller_1.handleArtistConfirm);
// POST /api/physical-orders/:physicalId/refund-request
//      Artist submits a refund request for admin to review
router.post('/:physicalId/refund-request', (0, auth_middleware_1.authorize)(['ARTIST']), physical_order_controller_1.validateRefundRequest, physical_order_controller_1.handleArtistRefundRequest);
// ── Shared buyer + artist routes ──────────────────────────────────────────────
// GET  /api/physical-orders/:physicalId
//      View full order item details (scoped per role in service layer)
router.get('/:physicalId', (0, auth_middleware_1.authorize)(['USER', 'ARTIST', 'ADMIN']), physical_order_controller_1.validatePhysicalId, physical_order_controller_1.handleGetOrderView);
// POST /api/physical-orders/:physicalId/cancel
//      Buyer or artist cancels (only within AWAITING_CONFIRMATION window)
//      Admin can cancel from any non-delivered state
router.post('/:physicalId/cancel', (0, auth_middleware_1.authorize)(['USER', 'ARTIST', 'ADMIN']), physical_order_controller_1.validateCancelItem, physical_order_controller_1.handleCancelItem);
// GET  /api/physical-orders/:physicalId/invoice
//      Download latest invoice URL (buyer, artist, or admin)
router.get('/:physicalId/invoice', (0, auth_middleware_1.authorize)(['USER', 'ARTIST', 'ADMIN']), physical_order_controller_1.validatePhysicalId, physical_order_controller_1.handleDownloadInvoice);
// GET  /api/physical-orders/:physicalId/receipt
//      Download payment receipt (buyer, artist, or admin) — proof of
//      payment, distinct from the itemized invoice above.
router.get('/:physicalId/receipt', (0, auth_middleware_1.authorize)(['USER', 'ARTIST', 'ADMIN']), physical_order_controller_1.validatePhysicalId, physical_order_controller_1.handleDownloadReceipt);
// ── Admin-only routes ─────────────────────────────────────────────────────────
// PATCH /api/physical-orders/:orderId/shipping-address
//       Admin-only. Buyers cannot edit their own order; only the delivery
//       address is mutable, and only by an admin.
router.patch('/:orderId/shipping-address', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.validateUpdateShippingAddress, physical_order_controller_1.handleUpdateShippingAddress);
// POST /api/physical-orders/refund-requests/:requestId/process
//      Admin approves or rejects a refund request
router.post('/refund-requests/:requestId/process', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.validateProcessRefund, physical_order_controller_1.handleAdminProcessRefund);
// POST /api/physical-orders/:physicalId/activate-pickup
//      Admin assigns courier and activates pickup
router.post('/:physicalId/activate-pickup', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.validateActivatePickup, physical_order_controller_1.handleActivatePickup);
// PATCH /api/physical-orders/:physicalId/courier
//       Admin updates courier name, type, tracking_id at any live stage
router.patch('/:physicalId/courier', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.validateUpdateCourierInfo, physical_order_controller_1.handleUpdateCourierInfo);
// POST /api/physical-orders/:physicalId/picked-up
router.post('/:physicalId/picked-up', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.validateNotesOnly, physical_order_controller_1.handleMarkPickedUp);
// POST /api/physical-orders/:physicalId/in-transit
router.post('/:physicalId/in-transit', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.validateTransitUpdate, physical_order_controller_1.handleMarkInTransit);
// POST /api/physical-orders/:physicalId/out-for-delivery
router.post('/:physicalId/out-for-delivery', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.validateNotesOnly, physical_order_controller_1.handleMarkOutForDelivery);
// POST /api/physical-orders/:physicalId/delivered
router.post('/:physicalId/delivered', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.validateNotesOnly, physical_order_controller_1.handleMarkDelivered);
// POST /api/physical-orders/:physicalId/delivery-failed
router.post('/:physicalId/delivery-failed', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.validateNotesOnly, physical_order_controller_1.handleMarkDeliveryFailed);
// POST /api/physical-orders/:physicalId/delayed
router.post('/:physicalId/delayed', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.validateNotesOnly, physical_order_controller_1.handleMarkDelayed);
// POST /api/physical-orders/:physicalId/pickup-failure
router.post('/:physicalId/pickup-failure', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.validateFailureReason, physical_order_controller_1.handlePickupFailure);
// POST /api/physical-orders/:physicalId/delivery-proof
//      Admin uploads immutable delivery proof image (metadata only — Cloudinary upload
//      is done client-side via signed URL; this endpoint records the result)
router.post('/:physicalId/delivery-proof', (0, auth_middleware_1.authorize)(['ADMIN']), physical_order_controller_1.validateDeliveryProof, physical_order_controller_1.handleAddDeliveryProof);
//# sourceMappingURL=physical-order.routes.js.map