"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderListValidation = exports.updateStatusValidation = exports.orderIdValidation = exports.confirmPaymentValidation = exports.checkoutValidation = void 0;
exports.handleCheckout = handleCheckout;
exports.handleGetBuyerOrders = handleGetBuyerOrders;
exports.handleGetSellerOrders = handleGetSellerOrders;
exports.handleGetOrder = handleGetOrder;
exports.handleConfirmPayment = handleConfirmPayment;
exports.handleCancelOrder = handleCancelOrder;
exports.handleUpdateStatus = handleUpdateStatus;
const express_validator_1 = require("express-validator");
const order_service_1 = require("../services/order.service");
const errors_1 = require("../../../common/errors");
// ── Validation helper ─────────────────────────────────────────────────────────
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map(e => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
// ── Validation chains ─────────────────────────────────────────────────────────
exports.checkoutValidation = [
    (0, express_validator_1.body)('cart_item_ids')
        .isArray({ min: 1 })
        .withMessage('cart_item_ids must be a non-empty array'),
    (0, express_validator_1.body)('cart_item_ids.*')
        .isUUID()
        .withMessage('Each cart_item_id must be a valid UUID'),
    (0, express_validator_1.body)('idempotency_key')
        .isUUID()
        .withMessage('idempotency_key must be a valid UUID'),
    (0, express_validator_1.body)('notes')
        .optional()
        .isString()
        .isLength({ max: 1000 })
        .trim()
        .withMessage('notes cannot exceed 1000 characters'),
    // Saved address reference — mutually exclusive with the inline snapshot below
    (0, express_validator_1.body)('shipping_address_id')
        .optional()
        .isUUID()
        .withMessage('shipping_address_id must be a valid UUID'),
    (0, express_validator_1.body)('save_address')
        .optional()
        .isBoolean()
        .withMessage('save_address must be a boolean'),
    // Shipping address — required for physical orders, validated if present
    (0, express_validator_1.body)('shipping_address.full_name')
        .optional()
        .isString()
        .isLength({ min: 1, max: 200 })
        .trim()
        .withMessage('full_name is required'),
    (0, express_validator_1.body)('shipping_address.phone')
        .optional()
        .isString()
        .isLength({ min: 5, max: 30 })
        .withMessage('phone is required'),
    (0, express_validator_1.body)('shipping_address.address_line_1')
        .optional()
        .isString()
        .isLength({ min: 1, max: 300 })
        .trim()
        .withMessage('address_line_1 is required'),
    (0, express_validator_1.body)('shipping_address.address_line_2')
        .optional({ nullable: true })
        .isString()
        .isLength({ max: 300 })
        .trim(),
    (0, express_validator_1.body)('shipping_address.city')
        .optional()
        .isString()
        .isLength({ min: 1, max: 100 })
        .trim()
        .withMessage('city is required'),
    (0, express_validator_1.body)('shipping_address.state')
        .optional()
        .isString()
        .isLength({ min: 1, max: 100 })
        .trim()
        .withMessage('state is required'),
    (0, express_validator_1.body)('shipping_address.postal_code')
        .optional()
        .isString()
        .isLength({ min: 1, max: 20 })
        .trim()
        .withMessage('postal_code is required'),
    (0, express_validator_1.body)('shipping_address.country_code')
        .optional()
        .isISO31661Alpha2()
        .withMessage('country_code must be a valid ISO 3166-1 alpha-2 code'),
];
exports.confirmPaymentValidation = [
    (0, express_validator_1.param)('id')
        .isUUID()
        .withMessage('Invalid order id'),
    (0, express_validator_1.body)('tx_hash')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('tx_hash is required'),
    (0, express_validator_1.body)('sender_wallet_address')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('sender_wallet_address is required'),
    (0, express_validator_1.body)('network')
        .isIn(['TRON', 'ETHEREUM', 'BSC'])
        .withMessage('network must be one of TRON, ETHEREUM, BSC'),
];
exports.orderIdValidation = [
    (0, express_validator_1.param)('id')
        .isUUID()
        .withMessage('Invalid order id'),
];
exports.updateStatusValidation = [
    (0, express_validator_1.param)('id')
        .isUUID()
        .withMessage('Invalid order id'),
    (0, express_validator_1.body)('status')
        .isIn(['SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDED'])
        .withMessage('status must be one of SHIPPED, COMPLETED, CANCELLED, REFUNDED'),
];
exports.orderListValidation = [
    (0, express_validator_1.query)('status')
        .optional()
        .isIn([
        'PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'PROCESSING',
        'SHIPPED', 'FULFILLED', 'COMPLETED', 'CANCELLED', 'REFUNDED',
    ])
        .withMessage('Invalid status filter'),
    (0, express_validator_1.query)('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('page must be a positive integer'),
    (0, express_validator_1.query)('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('limit must be between 1 and 50'),
    (0, express_validator_1.query)('sort_order')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('sort_order must be asc or desc'),
];
// ── Handlers ──────────────────────────────────────────────────────────────────
// POST /api/orders/checkout
async function handleCheckout(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const b = req.body;
        // FIX: Conditionally spread fields to satisfy exactOptionalPropertyTypes
        const input = {
            cart_item_ids: b['cart_item_ids'].map(String),
            idempotency_key: String(b['idempotency_key']),
            ...(b['notes'] && { notes: String(b['notes']) }),
            ...(b['shipping_address_id'] !== undefined && { shipping_address_id: String(b['shipping_address_id']) }),
            ...(b['shipping_address'] !== undefined && { shipping_address: b['shipping_address'] }),
            ...(b['save_address'] !== undefined && { save_address: Boolean(b['save_address']) }),
        };
        const result = await order_service_1.orderService.initiateCheckout(req.auth.sub, input);
        res.status(201).json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
// GET /api/orders
async function handleGetBuyerOrders(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const q = req.query;
        // FIX: Conditionally spread properties so undefined properties are omitted entirely
        const filters = {
            ...(q['status'] && { status: q['status'] }),
            ...(q['page'] && { page: Number(q['page']) }),
            ...(q['limit'] && { limit: Number(q['limit']) }),
            ...(q['sort_order'] && { sort_order: q['sort_order'] }),
        };
        const result = await order_service_1.orderService.getBuyerOrders(req.auth.sub, filters);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
// GET /api/orders/sales
async function handleGetSellerOrders(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const q = req.query;
        // FIX: Conditionally spread properties so undefined properties are omitted entirely
        const filters = {
            ...(q['status'] && { status: q['status'] }),
            ...(q['page'] && { page: Number(q['page']) }),
            ...(q['limit'] && { limit: Number(q['limit']) }),
            ...(q['sort_order'] && { sort_order: q['sort_order'] }),
        };
        const result = await order_service_1.orderService.getSellerOrders(req.auth.sub, filters);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
// GET /api/orders/:id
async function handleGetOrder(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const order = await order_service_1.orderService.getOrder(id, req.auth.sub);
        res.json({ success: true, data: order });
    }
    catch (err) {
        next(err);
    }
}
// POST /api/orders/:id/confirm-payment
async function handleConfirmPayment(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const b = req.body;
        const input = {
            tx_hash: String(b['tx_hash']).trim(),
            sender_wallet_address: String(b['sender_wallet_address']).trim(),
            network: b['network'],
        };
        const result = await order_service_1.orderService.confirmPayment(id, req.auth.sub, input);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
// POST /api/orders/:id/cancel
async function handleCancelOrder(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const order = await order_service_1.orderService.cancelOrder(id, req.auth.sub);
        res.json({ success: true, data: order });
    }
    catch (err) {
        next(err);
    }
}
// PATCH /api/orders/:id/status
async function handleUpdateStatus(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const status = String(req.body['status']);
        const order = await order_service_1.orderService.updateOrderStatus(id, req.auth.sub, req.auth.role, status);
        res.json({ success: true, data: order });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=order.controller.js.map