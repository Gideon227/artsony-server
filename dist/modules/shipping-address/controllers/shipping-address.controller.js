"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shippingAddressIdValidation = exports.updateShippingAddressValidation = exports.createShippingAddressValidation = void 0;
exports.handleList = handleList;
exports.handleGet = handleGet;
exports.handleCreate = handleCreate;
exports.handleUpdate = handleUpdate;
exports.handleSetDefault = handleSetDefault;
exports.handleDelete = handleDelete;
const express_validator_1 = require("express-validator");
const shipping_address_service_1 = require("../services/shipping-address.service");
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
const addressFields = [
    (0, express_validator_1.body)('label')
        .optional({ nullable: true })
        .isString()
        .isLength({ max: 80 })
        .trim(),
    (0, express_validator_1.body)('full_name')
        .isString()
        .isLength({ min: 1, max: 200 })
        .trim()
        .withMessage('full_name is required'),
    (0, express_validator_1.body)('phone')
        .isString()
        .isLength({ min: 5, max: 30 })
        .trim()
        .withMessage('phone is required'),
    (0, express_validator_1.body)('address_line_1')
        .isString()
        .isLength({ min: 1, max: 300 })
        .trim()
        .withMessage('address_line_1 is required'),
    (0, express_validator_1.body)('address_line_2')
        .optional({ nullable: true })
        .isString()
        .isLength({ max: 300 })
        .trim(),
    (0, express_validator_1.body)('city')
        .isString()
        .isLength({ min: 1, max: 100 })
        .trim()
        .withMessage('city is required'),
    (0, express_validator_1.body)('state')
        .isString()
        .isLength({ min: 1, max: 100 })
        .trim()
        .withMessage('state is required'),
    (0, express_validator_1.body)('postal_code')
        .isString()
        .isLength({ min: 1, max: 20 })
        .trim()
        .withMessage('postal_code is required'),
    (0, express_validator_1.body)('country_code')
        .isISO31661Alpha2()
        .withMessage('country_code must be a valid ISO 3166-1 alpha-2 code'),
    (0, express_validator_1.body)('is_default')
        .optional()
        .isBoolean()
        .withMessage('is_default must be a boolean'),
];
exports.createShippingAddressValidation = addressFields;
exports.updateShippingAddressValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid shipping address id'),
    ...addressFields.map(chain => chain.optional()),
];
exports.shippingAddressIdValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid shipping address id'),
];
// ── Handlers ──────────────────────────────────────────────────────────────────
function buildInput(body) {
    return {
        label: body['label'] ?? null,
        full_name: String(body['full_name']),
        phone: String(body['phone']),
        address_line_1: String(body['address_line_1']),
        address_line_2: body['address_line_2'] ?? null,
        city: String(body['city']),
        state: String(body['state']),
        postal_code: String(body['postal_code']),
        country_code: String(body['country_code']).toUpperCase(),
        is_default: Boolean(body['is_default'] ?? false),
    };
}
// GET /api/shipping-addresses
async function handleList(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const addresses = await shipping_address_service_1.shippingAddressService.list(req.auth.sub);
        res.json({ success: true, data: addresses });
    }
    catch (err) {
        next(err);
    }
}
// GET /api/shipping-addresses/:id
async function handleGet(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const address = await shipping_address_service_1.shippingAddressService.get(id, req.auth.sub);
        res.json({ success: true, data: address });
    }
    catch (err) {
        next(err);
    }
}
// POST /api/shipping-addresses
async function handleCreate(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const input = buildInput(req.body);
        const address = await shipping_address_service_1.shippingAddressService.create(req.auth.sub, input);
        res.status(201).json({ success: true, data: address });
    }
    catch (err) {
        next(err);
    }
}
// PATCH /api/shipping-addresses/:id
async function handleUpdate(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const b = req.body;
        const input = {
            ...(b['label'] !== undefined && { label: b['label'] }),
            ...(b['full_name'] !== undefined && { full_name: String(b['full_name']) }),
            ...(b['phone'] !== undefined && { phone: String(b['phone']) }),
            ...(b['address_line_1'] !== undefined && { address_line_1: String(b['address_line_1']) }),
            ...(b['address_line_2'] !== undefined && { address_line_2: b['address_line_2'] }),
            ...(b['city'] !== undefined && { city: String(b['city']) }),
            ...(b['state'] !== undefined && { state: String(b['state']) }),
            ...(b['postal_code'] !== undefined && { postal_code: String(b['postal_code']) }),
            ...(b['country_code'] !== undefined && { country_code: String(b['country_code']).toUpperCase() }),
        };
        const address = await shipping_address_service_1.shippingAddressService.update(id, req.auth.sub, input);
        res.json({ success: true, data: address });
    }
    catch (err) {
        next(err);
    }
}
// POST /api/shipping-addresses/:id/default
async function handleSetDefault(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const address = await shipping_address_service_1.shippingAddressService.setDefault(id, req.auth.sub);
        res.json({ success: true, data: address });
    }
    catch (err) {
        next(err);
    }
}
// DELETE /api/shipping-addresses/:id
async function handleDelete(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        await shipping_address_service_1.shippingAddressService.remove(id, req.auth.sub);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=shipping-address.controller.js.map