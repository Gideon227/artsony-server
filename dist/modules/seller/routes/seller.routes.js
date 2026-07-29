"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellerRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../../middleware/rate-limit.middleware");
const seller_controller_1 = require("../controllers/seller.controller");
const router = (0, express_1.Router)();
exports.sellerRouter = router;
// All seller-registration routes require a valid access token
router.use(auth_middleware_1.requireAuth);
router.use(rate_limit_middleware_1.apiRateLimit);
// ── Self-service routes ─────────────────────────────────────────────────────
// Registered before any admin/:id routes below — /me is a literal segment,
// but keeping this ordering explicit matches the convention already used in
// physical-order.routes.ts (literal paths before param routes).
// POST /api/seller-registrations
//      Submit a new registration, or resubmit (edit) a REJECTED one back to PENDING
router.post('/', seller_controller_1.submitRegistrationValidation, seller_controller_1.handleSubmitRegistration);
// GET  /api/seller-registrations/me
//      View my own registration
router.get('/me', seller_controller_1.handleGetMyRegistration);
// PATCH /api/seller-registrations/me
//      Edit my own registration while it is still PENDING
router.patch('/me', seller_controller_1.updateRegistrationValidation, seller_controller_1.handleUpdateMyRegistration);
// ── Admin routes ─────────────────────────────────────────────────────────────
// GET  /api/seller-registrations/admin
//      Paginated, filterable list of all registrations
router.get('/admin', (0, auth_middleware_1.authorize)(['ADMIN']), seller_controller_1.listFiltersValidation, seller_controller_1.handleAdminList);
// GET  /api/seller-registrations/admin/:id
router.get('/admin/:id', (0, auth_middleware_1.authorize)(['ADMIN']), seller_controller_1.idParamValidation, seller_controller_1.handleAdminGetById);
// POST /api/seller-registrations/admin/:id/approve
//      PENDING -> APPROVED (initial review)
router.post('/admin/:id/approve', (0, auth_middleware_1.authorize)(['ADMIN']), seller_controller_1.reviewNotesValidation, seller_controller_1.handleApprove);
// POST /api/seller-registrations/admin/:id/reject
//      PENDING -> REJECTED, or SUSPENDED -> REJECTED (permanent removal)
router.post('/admin/:id/reject', (0, auth_middleware_1.authorize)(['ADMIN']), seller_controller_1.reviewNotesValidation, seller_controller_1.handleReject);
// POST /api/seller-registrations/admin/:id/suspend
//      APPROVED -> SUSPENDED — revokes marketplace privileges immediately and
//      pauses the seller's published MARKETPLACE artworks
router.post('/admin/:id/suspend', (0, auth_middleware_1.authorize)(['ADMIN']), seller_controller_1.reviewNotesValidation, seller_controller_1.handleSuspend);
// POST /api/seller-registrations/admin/:id/reactivate
//      SUSPENDED -> APPROVED — restores marketplace privileges and republishes
//      the seller's paused MARKETPLACE artworks
router.post('/admin/:id/reactivate', (0, auth_middleware_1.authorize)(['ADMIN']), seller_controller_1.reviewNotesValidation, seller_controller_1.handleReactivate);
//# sourceMappingURL=seller.routes.js.map