"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeItemValidation = exports.updateItemValidation = exports.addItemValidation = void 0;
exports.handleGetCart = handleGetCart;
exports.handleAddItem = handleAddItem;
exports.handleUpdateItem = handleUpdateItem;
exports.handleRemoveItem = handleRemoveItem;
exports.handleClearCart = handleClearCart;
const express_validator_1 = require("express-validator");
const cart_service_1 = require("../services/cart.service");
const errors_1 = require("../../../common/errors");
// ── Validation helper ─────────────────────────────────────────────────────────
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
// ── Validation chains ─────────────────────────────────────────────────────────
exports.addItemValidation = [
    (0, express_validator_1.body)('artwork_id')
        .isUUID()
        .withMessage('artwork_id must be a valid UUID'),
    (0, express_validator_1.body)('quantity')
        .isInt({ min: 1, max: 100 })
        .withMessage('quantity must be an integer between 1 and 100'),
    (0, express_validator_1.body)('variant_option_id')
        .optional()
        .isUUID()
        .withMessage('variant_option_id must be a valid UUID'),
];
exports.updateItemValidation = [
    (0, express_validator_1.param)('id')
        .isUUID()
        .withMessage('Invalid cart item id'),
    (0, express_validator_1.body)('quantity')
        .isInt({ min: 1, max: 100 })
        .withMessage('quantity must be an integer between 1 and 100'),
];
exports.removeItemValidation = [
    (0, express_validator_1.param)('id')
        .isUUID()
        .withMessage('Invalid cart item id'),
];
// ── Handlers ──────────────────────────────────────────────────────────────────
// GET /api/cart
async function handleGetCart(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const cart = await cart_service_1.cartService.getCart(req.auth.sub);
        res.json({ success: true, data: cart });
    }
    catch (err) {
        next(err);
    }
}
// POST /api/cart/items
async function handleAddItem(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const b = req.body;
        const input = {
            artwork_id: String(b['artwork_id']),
            quantity: Number(b['quantity']),
            ...(b['variant_option_id'] ? { variant_option_id: String(b['variant_option_id']) } : {}),
        };
        const cart = await cart_service_1.cartService.addItem(req.auth.sub, input);
        res.status(201).json({ success: true, data: cart });
    }
    catch (err) {
        next(err);
    }
}
// PATCH /api/cart/items/:id
async function handleUpdateItem(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const input = { quantity: Number(req.body['quantity']) };
        const cart = await cart_service_1.cartService.updateQuantity(req.auth.sub, id, input);
        res.json({ success: true, data: cart });
    }
    catch (err) {
        next(err);
    }
}
// DELETE /api/cart/items/:id
async function handleRemoveItem(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const cart = await cart_service_1.cartService.removeItem(req.auth.sub, id);
        res.json({ success: true, data: cart });
    }
    catch (err) {
        next(err);
    }
}
// DELETE /api/cart
async function handleClearCart(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        await cart_service_1.cartService.clearCart(req.auth.sub);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=cart.controller.js.map