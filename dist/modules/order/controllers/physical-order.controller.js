"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateUpdateShippingAddress = exports.validateListFilters = exports.validateDeliveryProof = exports.validateProcessRefund = exports.validateRefundRequest = exports.validateCancelItem = exports.validateFailureReason = exports.validateNotesOnly = exports.validateTransitUpdate = exports.validateUpdateCourierInfo = exports.validateActivatePickup = exports.validateArtistConfirm = exports.validatePhysicalId = void 0;
exports.handleBuyerList = handleBuyerList;
exports.handleArtistList = handleArtistList;
exports.handleAdminList = handleAdminList;
exports.handleGetOrderView = handleGetOrderView;
exports.handleArtistConfirm = handleArtistConfirm;
exports.handleActivatePickup = handleActivatePickup;
exports.handleUpdateCourierInfo = handleUpdateCourierInfo;
exports.handleMarkPickedUp = handleMarkPickedUp;
exports.handleMarkInTransit = handleMarkInTransit;
exports.handleMarkOutForDelivery = handleMarkOutForDelivery;
exports.handleMarkDelivered = handleMarkDelivered;
exports.handleMarkDeliveryFailed = handleMarkDeliveryFailed;
exports.handleMarkDelayed = handleMarkDelayed;
exports.handlePickupFailure = handlePickupFailure;
exports.handleCancelItem = handleCancelItem;
exports.handleArtistRefundRequest = handleArtistRefundRequest;
exports.handleAdminProcessRefund = handleAdminProcessRefund;
exports.handleAdminRefundRequests = handleAdminRefundRequests;
exports.handleAddDeliveryProof = handleAddDeliveryProof;
exports.handleDownloadInvoice = handleDownloadInvoice;
exports.handleDownloadReceipt = handleDownloadReceipt;
exports.handleUpdateShippingAddress = handleUpdateShippingAddress;
const express_validator_1 = require("express-validator");
const physical_order_service_1 = require("../services/physical-order.service");
const errors_1 = require("../../../common/errors");
// ── Validation helper ─────────────────────────────────────────────────────────
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map(e => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
// ── Role + auth extraction ────────────────────────────────────────────────────
function actor(req) {
    return { actorId: req.auth.sub, actorRole: req.auth.role };
}
// ── Filter builder ────────────────────────────────────────────────────────────
// Uses exactOptionalPropertyTypes-safe construction: only assign when defined.
function buildFilters(q) {
    const filters = {
        sort_order: q['sort_order'] === 'asc' ? 'asc' : 'desc',
        page: q['page'] ? parseInt(q['page'], 10) : 1,
        limit: q['limit'] ? parseInt(q['limit'], 10) : 20,
    };
    if (q['delivery_status'] !== undefined)
        filters.delivery_status = q['delivery_status'];
    if (q['timeline_status'] !== undefined)
        filters.timeline_status = q['timeline_status'];
    if (q['refund_status'] !== undefined)
        filters.refund_status = q['refund_status'];
    if (q['courier_name'] !== undefined)
        filters.courier_name = q['courier_name'];
    if (q['tracking_id'] !== undefined)
        filters.tracking_id = q['tracking_id'];
    if (q['date_from'] !== undefined)
        filters.date_from = q['date_from'];
    if (q['date_to'] !== undefined)
        filters.date_to = q['date_to'];
    if (q['order_number'] !== undefined)
        filters.order_number = q['order_number'];
    if (q['artist_id'] !== undefined)
        filters.artist_id = q['artist_id'];
    if (q['buyer_id'] !== undefined)
        filters.buyer_id = q['buyer_id'];
    return filters;
}
// ─────────────────────────────────────────────────────────────────────────────
// Validation chains
// ─────────────────────────────────────────────────────────────────────────────
exports.validatePhysicalId = [
    (0, express_validator_1.param)('physicalId').isUUID().withMessage('physicalId must be a valid UUID'),
];
exports.validateArtistConfirm = [...exports.validatePhysicalId];
exports.validateActivatePickup = [
    ...exports.validatePhysicalId,
    (0, express_validator_1.body)('courier_name')
        .isString().trim().isLength({ min: 2, max: 120 })
        .withMessage('courier_name must be 2–120 characters'),
    (0, express_validator_1.body)('courier_service_type')
        .isIn(['STANDARD', 'EXPRESS', 'OVERNIGHT', 'ECONOMY'])
        .withMessage('courier_service_type must be STANDARD, EXPRESS, OVERNIGHT, or ECONOMY'),
    (0, express_validator_1.body)('shipping_cost')
        .isFloat({ min: 0 })
        .withMessage('shipping_cost must be a non-negative number'),
    (0, express_validator_1.body)('pickup_address')
        .isString().trim().isLength({ min: 5, max: 500 })
        .withMessage('pickup_address must be 5–500 characters'),
    (0, express_validator_1.body)('estimated_delivery_date')
        .optional()
        .isISO8601().withMessage('estimated_delivery_date must be a valid ISO 8601 date'),
];
exports.validateUpdateCourierInfo = [
    ...exports.validatePhysicalId,
    (0, express_validator_1.body)('courier_name')
        .optional().isString().trim().isLength({ min: 2, max: 120 }),
    (0, express_validator_1.body)('courier_service_type')
        .optional().isIn(['STANDARD', 'EXPRESS', 'OVERNIGHT', 'ECONOMY']),
    (0, express_validator_1.body)('tracking_id')
        .optional().isString().trim().isLength({ min: 2, max: 200 }),
    (0, express_validator_1.body)('shipping_cost')
        .optional().isFloat({ min: 0 }),
    (0, express_validator_1.body)('estimated_delivery_date')
        .optional().isISO8601(),
    (0, express_validator_1.body)('pickup_address')
        .optional().isString().trim().isLength({ min: 5, max: 500 }),
];
exports.validateTransitUpdate = [
    ...exports.validatePhysicalId,
    (0, express_validator_1.body)('tracking_id').optional().isString().trim().isLength({ min: 2, max: 200 }),
    (0, express_validator_1.body)('notes').optional().isString().trim().isLength({ max: 1000 }),
];
exports.validateNotesOnly = [
    ...exports.validatePhysicalId,
    (0, express_validator_1.body)('notes').optional().isString().trim().isLength({ max: 1000 }),
];
exports.validateFailureReason = [
    ...exports.validatePhysicalId,
    (0, express_validator_1.body)('reason')
        .isIn(['PICKUP_FAILED', 'COURIER_REJECTED_PICKUP'])
        .withMessage('reason must be PICKUP_FAILED or COURIER_REJECTED_PICKUP'),
    (0, express_validator_1.body)('notes')
        .isString().trim().isLength({ min: 5, max: 1000 })
        .withMessage('notes is required (5–1000 characters)'),
];
exports.validateCancelItem = [
    ...exports.validatePhysicalId,
    (0, express_validator_1.body)('reason')
        .isString().trim().isLength({ min: 5, max: 1000 })
        .withMessage('reason is required (5–1000 characters)'),
];
exports.validateRefundRequest = [
    ...exports.validatePhysicalId,
    (0, express_validator_1.body)('reason')
        .isString().trim().isLength({ min: 10, max: 2000 })
        .withMessage('reason is required (10–2000 characters)'),
];
exports.validateProcessRefund = [
    (0, express_validator_1.param)('requestId').isUUID().withMessage('requestId must be a valid UUID'),
    (0, express_validator_1.body)('decision')
        .isIn(['APPROVED', 'REJECTED'])
        .withMessage('decision must be APPROVED or REJECTED'),
    (0, express_validator_1.body)('admin_notes').optional().isString().trim().isLength({ max: 2000 }),
    (0, express_validator_1.body)('item_cost')
        .if((0, express_validator_1.body)('decision').equals('APPROVED'))
        .isFloat({ min: 0 })
        .withMessage('item_cost is required and must be non-negative when approving'),
];
exports.validateDeliveryProof = [
    ...exports.validatePhysicalId,
    (0, express_validator_1.body)('cloudinary_public_id').isString().trim().notEmpty(),
    (0, express_validator_1.body)('secure_url').isURL().withMessage('secure_url must be a valid URL'),
    (0, express_validator_1.body)('mime_type').isString().trim().notEmpty(),
    (0, express_validator_1.body)('file_size_bytes').isInt({ min: 1 }),
];
exports.validateListFilters = [
    (0, express_validator_1.query)('delivery_status').optional().isIn(['LIVE', 'DELIVERED', 'CANCELLED']),
    (0, express_validator_1.query)('refund_status').optional().isIn(['NONE', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL']),
    (0, express_validator_1.query)('sort_order').optional().isIn(['asc', 'desc']),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 50 }),
    (0, express_validator_1.query)('date_from').optional().isISO8601(),
    (0, express_validator_1.query)('date_to').optional().isISO8601(),
    (0, express_validator_1.query)('view').optional().isIn(['all', 'live', 'delivered', 'cancelled', 'pending', 'completed']),
];
exports.validateUpdateShippingAddress = [
    (0, express_validator_1.param)('orderId').isUUID().withMessage('orderId must be a valid UUID'),
    (0, express_validator_1.body)('full_name').isString().trim().isLength({ min: 2, max: 200 }).withMessage('full_name is required'),
    (0, express_validator_1.body)('phone').isString().trim().isLength({ min: 5, max: 30 }).withMessage('phone is required'),
    (0, express_validator_1.body)('address_line_1').isString().trim().isLength({ min: 3, max: 300 }).withMessage('address_line_1 is required'),
    (0, express_validator_1.body)('address_line_2').optional().isString().trim().isLength({ max: 300 }),
    (0, express_validator_1.body)('city').isString().trim().isLength({ min: 1, max: 120 }).withMessage('city is required'),
    (0, express_validator_1.body)('state').isString().trim().isLength({ min: 1, max: 120 }).withMessage('state is required'),
    (0, express_validator_1.body)('postal_code').isString().trim().isLength({ min: 1, max: 30 }).withMessage('postal_code is required'),
    (0, express_validator_1.body)('country_code').isString().trim().isLength({ min: 2, max: 2 }).withMessage('country_code must be a 2-letter ISO code'),
];
// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────
async function handleBuyerList(req, res, next) {
    try {
        assertValid(req);
        const { actorId } = actor(req);
        const rawView = req.query['view'] ?? 'all';
        const view = ['all', 'live', 'delivered', 'cancelled'].includes(rawView)
            ? rawView
            : 'all';
        const result = await physical_order_service_1.physicalOrderService.listForBuyer(actorId, view, buildFilters(req.query));
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function handleArtistList(req, res, next) {
    try {
        assertValid(req);
        const { actorId } = actor(req);
        const rawView = req.query['view'] ?? 'all';
        const view = ['all', 'live', 'pending', 'completed', 'cancelled'].includes(rawView)
            ? rawView
            : 'all';
        const result = await physical_order_service_1.physicalOrderService.listForArtist(actorId, view, buildFilters(req.query));
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function handleAdminList(req, res, next) {
    try {
        assertValid(req);
        const result = await physical_order_service_1.physicalOrderService.adminList(buildFilters(req.query));
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function handleGetOrderView(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const view = await physical_order_service_1.physicalOrderService.getOrderView(req.params['physicalId'], actorId, actorRole);
        res.json({ success: true, data: view });
    }
    catch (err) {
        next(err);
    }
}
async function handleArtistConfirm(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const physical = await physical_order_service_1.physicalOrderService.artistConfirm({
            physicalId: req.params['physicalId'],
            actorId,
            actorRole,
        });
        res.json({ success: true, data: physical });
    }
    catch (err) {
        next(err);
    }
}
async function handleActivatePickup(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const b = req.body;
        // Build input object exactOptionalPropertyTypes-safe
        const serviceInput = {
            physicalId: req.params['physicalId'],
            actorId,
            actorRole,
            courier_name: b.courier_name,
            courier_service_type: b.courier_service_type,
            shipping_cost: b.shipping_cost,
            pickup_address: b.pickup_address,
        };
        if (b.estimated_delivery_date !== undefined) {
            serviceInput.estimated_delivery_date = b.estimated_delivery_date;
        }
        const physical = await physical_order_service_1.physicalOrderService.adminActivatePickup(serviceInput);
        res.json({ success: true, data: physical });
    }
    catch (err) {
        next(err);
    }
}
async function handleUpdateCourierInfo(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const b = req.body;
        const serviceInput = {
            physicalId: req.params['physicalId'],
            actorId,
            actorRole,
        };
        if (b.courier_name !== undefined)
            serviceInput.courier_name = b.courier_name;
        if (b.courier_service_type !== undefined)
            serviceInput.courier_service_type = b.courier_service_type;
        if (b.tracking_id !== undefined)
            serviceInput.tracking_id = b.tracking_id;
        if (b.shipping_cost !== undefined)
            serviceInput.shipping_cost = b.shipping_cost;
        if (b.estimated_delivery_date !== undefined)
            serviceInput.estimated_delivery_date = b.estimated_delivery_date;
        if (b.pickup_address !== undefined)
            serviceInput.pickup_address = b.pickup_address;
        const physical = await physical_order_service_1.physicalOrderService.updateCourierInfo(serviceInput);
        res.json({ success: true, data: physical });
    }
    catch (err) {
        next(err);
    }
}
async function handleMarkPickedUp(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const physical = await physical_order_service_1.physicalOrderService.adminMarkPickedUp({
            physicalId: req.params['physicalId'],
            actorId,
            actorRole,
        });
        res.json({ success: true, data: physical });
    }
    catch (err) {
        next(err);
    }
}
async function handleMarkInTransit(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const b = req.body;
        const serviceInput = {
            physicalId: req.params['physicalId'],
            actorId,
            actorRole,
        };
        if (b.tracking_id !== undefined)
            serviceInput.tracking_id = b.tracking_id;
        if (b.notes !== undefined)
            serviceInput.notes = b.notes;
        const physical = await physical_order_service_1.physicalOrderService.adminMarkInTransit(serviceInput);
        res.json({ success: true, data: physical });
    }
    catch (err) {
        next(err);
    }
}
async function handleMarkOutForDelivery(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const physical = await physical_order_service_1.physicalOrderService.adminMarkOutForDelivery({
            physicalId: req.params['physicalId'],
            actorId,
            actorRole,
        });
        res.json({ success: true, data: physical });
    }
    catch (err) {
        next(err);
    }
}
async function handleMarkDelivered(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const physical = await physical_order_service_1.physicalOrderService.adminMarkDelivered({
            physicalId: req.params['physicalId'],
            actorId,
            actorRole,
        });
        res.json({ success: true, data: physical });
    }
    catch (err) {
        next(err);
    }
}
async function handleMarkDeliveryFailed(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const b = req.body;
        const physical = await physical_order_service_1.physicalOrderService.adminMarkDeliveryFailed({
            physicalId: req.params['physicalId'],
            actorId,
            actorRole,
            notes: b.notes ?? 'Delivery failed',
        });
        res.json({ success: true, data: physical });
    }
    catch (err) {
        next(err);
    }
}
async function handleMarkDelayed(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const b = req.body;
        const physical = await physical_order_service_1.physicalOrderService.adminMarkDelayed({
            physicalId: req.params['physicalId'],
            actorId,
            actorRole,
            notes: b.notes ?? 'Delivery delayed',
        });
        res.json({ success: true, data: physical });
    }
    catch (err) {
        next(err);
    }
}
async function handlePickupFailure(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const b = req.body;
        const physical = await physical_order_service_1.physicalOrderService.adminHandlePickupFailure({
            physicalId: req.params['physicalId'],
            actorId,
            actorRole,
            reason: b.reason,
            notes: b.notes,
        });
        res.json({ success: true, data: physical });
    }
    catch (err) {
        next(err);
    }
}
async function handleCancelItem(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const b = req.body;
        const physical = await physical_order_service_1.physicalOrderService.cancelItem({
            physicalId: req.params['physicalId'],
            actorId,
            actorRole,
            reason: b.reason,
        });
        res.json({ success: true, data: physical });
    }
    catch (err) {
        next(err);
    }
}
async function handleArtistRefundRequest(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const b = req.body;
        const request = await physical_order_service_1.physicalOrderService.artistRequestRefund({
            physicalId: req.params['physicalId'],
            actorId,
            actorRole,
            reason: b.reason,
        });
        res.status(201).json({ success: true, data: request });
    }
    catch (err) {
        next(err);
    }
}
async function handleAdminProcessRefund(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const b = req.body;
        // Build exactOptionalPropertyTypes-safe input
        const serviceInput = {
            requestId: req.params['requestId'],
            actorId,
            actorRole,
            decision: b.decision,
        };
        if (b.admin_notes !== undefined)
            serviceInput.admin_notes = b.admin_notes;
        if (b.item_cost !== undefined)
            serviceInput.item_cost = b.item_cost;
        if (b.order_number !== undefined)
            serviceInput.order_number = b.order_number;
        const result = await physical_order_service_1.physicalOrderService.adminProcessRefund(serviceInput);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
async function handleAdminRefundRequests(req, res, next) {
    try {
        const requests = await physical_order_service_1.physicalOrderService.adminListRefundRequests();
        res.json({ success: true, data: requests });
    }
    catch (err) {
        next(err);
    }
}
async function handleAddDeliveryProof(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const b = req.body;
        const proof = await physical_order_service_1.physicalOrderService.addDeliveryProof({
            physicalId: req.params['physicalId'],
            actorId,
            actorRole,
            cloudinary_public_id: b.cloudinary_public_id,
            secure_url: b.secure_url,
            mime_type: b.mime_type,
            file_size_bytes: b.file_size_bytes,
        });
        res.status(201).json({ success: true, data: proof });
    }
    catch (err) {
        next(err);
    }
}
async function handleDownloadInvoice(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const view = await physical_order_service_1.physicalOrderService.getOrderView(req.params['physicalId'], actorId, actorRole);
        if (!view.invoice) {
            res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No invoice available for this order yet' });
            return;
        }
        res.json({ success: true, data: { invoice_url: view.invoice.pdf_url, version: view.invoice.version } });
    }
    catch (err) {
        next(err);
    }
}
// GET /physical-orders/:physicalId/receipt — download payment receipt
// Distinct document from the invoice: confirms payment received
// (amount, method, transaction reference), not itemized goods/pricing.
async function handleDownloadReceipt(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const view = await physical_order_service_1.physicalOrderService.getOrderView(req.params['physicalId'], actorId, actorRole);
        if (!view.receipt) {
            res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No receipt available for this order yet' });
            return;
        }
        res.json({ success: true, data: { receipt_url: view.receipt.pdf_url } });
    }
    catch (err) {
        next(err);
    }
}
// PATCH /physical-orders/:orderId/shipping-address — admin-only.
// Buyers cannot edit their own order; only the delivery address is
// mutable, and only by an admin.
async function handleUpdateShippingAddress(req, res, next) {
    try {
        assertValid(req);
        const { actorId, actorRole } = actor(req);
        const b = req.body;
        const updated = await physical_order_service_1.physicalOrderService.updateShippingAddress({
            orderId: req.params['orderId'],
            actorId,
            actorRole,
            address: {
                full_name: b.full_name,
                phone: b.phone,
                address_line_1: b.address_line_1,
                address_line_2: b.address_line_2 ?? null,
                city: b.city,
                state: b.state,
                postal_code: b.postal_code,
                country_code: b.country_code,
            },
        });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=physical-order.controller.js.map