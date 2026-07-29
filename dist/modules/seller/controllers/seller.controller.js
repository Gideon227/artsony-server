"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleReactivate = exports.handleSuspend = exports.handleReject = exports.handleApprove = exports.listFiltersValidation = exports.reviewNotesValidation = exports.idParamValidation = exports.updateRegistrationValidation = exports.submitRegistrationValidation = void 0;
exports.handleSubmitRegistration = handleSubmitRegistration;
exports.handleGetMyRegistration = handleGetMyRegistration;
exports.handleUpdateMyRegistration = handleUpdateMyRegistration;
exports.handleAdminList = handleAdminList;
exports.handleAdminGetById = handleAdminGetById;
const express_validator_1 = require("express-validator");
const sellerService = __importStar(require("../services/seller.service"));
const error_middleware_1 = require("../../../middleware/error.middleware");
const errors_1 = require("../../../common/errors");
// ── Validation helper (mirrors auth.controller.ts / artwork.controller.ts) ────
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
// ── Validation chains ──────────────────────────────────────────────────────────
const registrationFieldValidation = [
    (0, express_validator_1.body)('full_name')
        .isString().trim().isLength({ min: 1, max: 150 })
        .withMessage('full_name is required (max 150 characters)'),
    (0, express_validator_1.body)('username')
        .isString().trim().isLength({ min: 3, max: 30 })
        .withMessage('username must be 3–30 characters'),
    (0, express_validator_1.body)('email')
        .isEmail().normalizeEmail().trim()
        .withMessage('a valid email is required'),
    (0, express_validator_1.body)('phone_number')
        .isString().trim().isLength({ min: 5, max: 30 })
        .withMessage('phone_number is required (5–30 characters)'),
    (0, express_validator_1.body)('address')
        .isString().trim().isLength({ min: 1, max: 300 })
        .withMessage('address is required (max 300 characters)'),
    (0, express_validator_1.body)('state')
        .isString().trim().isLength({ min: 1, max: 120 })
        .withMessage('state is required'),
    (0, express_validator_1.body)('country')
        .isString().trim().isLength({ min: 2, max: 2 })
        .withMessage('country must be a 2-letter ISO code'),
    (0, express_validator_1.body)('postal_code')
        .optional().isString().trim().isLength({ max: 30 }),
];
exports.submitRegistrationValidation = registrationFieldValidation;
exports.updateRegistrationValidation = [
    (0, express_validator_1.body)('full_name').optional().isString().trim().isLength({ min: 1, max: 150 }),
    (0, express_validator_1.body)('username').optional().isString().trim().isLength({ min: 3, max: 30 }),
    (0, express_validator_1.body)('email').optional().isEmail().normalizeEmail().trim(),
    (0, express_validator_1.body)('phone_number').optional().isString().trim().isLength({ min: 5, max: 30 }),
    (0, express_validator_1.body)('address').optional().isString().trim().isLength({ min: 1, max: 300 }),
    (0, express_validator_1.body)('state').optional().isString().trim().isLength({ min: 1, max: 120 }),
    (0, express_validator_1.body)('country').optional().isString().trim().isLength({ min: 2, max: 2 }),
    (0, express_validator_1.body)('postal_code').optional().isString().trim().isLength({ max: 30 }),
];
exports.idParamValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('id must be a valid UUID'),
];
exports.reviewNotesValidation = [
    ...exports.idParamValidation,
    (0, express_validator_1.body)('notes').optional().isString().trim().isLength({ max: 2000 }),
];
exports.listFiltersValidation = [
    (0, express_validator_1.query)('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 50 }),
];
// ── Self-service handlers ──────────────────────────────────────────────────────
async function handleSubmitRegistration(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const payload = req.body;
        const input = {
            full_name: String(payload['full_name']).trim(),
            username: String(payload['username']).trim(),
            email: String(payload['email']).trim(),
            phone_number: String(payload['phone_number']).trim(),
            address: String(payload['address']).trim(),
            state: String(payload['state']).trim(),
            country: String(payload['country']).trim().toUpperCase(),
            ...(payload['postal_code'] !== undefined ? { postal_code: String(payload['postal_code']).trim() } : {}),
        };
        const ctx = (0, error_middleware_1.extractRequestContext)(req);
        const registration = await sellerService.submitRegistration(req.auth.sub, input, ctx);
        res.status(201).json({ success: true, data: registration });
    }
    catch (err) {
        next(err);
    }
}
async function handleGetMyRegistration(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const registration = await sellerService.getMyRegistration(req.auth.sub);
        res.json({ success: true, data: registration });
    }
    catch (err) {
        next(err);
    }
}
async function handleUpdateMyRegistration(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const payload = req.body;
        const input = {
            ...(payload['full_name'] !== undefined ? { full_name: String(payload['full_name']).trim() } : {}),
            ...(payload['username'] !== undefined ? { username: String(payload['username']).trim() } : {}),
            ...(payload['email'] !== undefined ? { email: String(payload['email']).trim() } : {}),
            ...(payload['phone_number'] !== undefined ? { phone_number: String(payload['phone_number']).trim() } : {}),
            ...(payload['address'] !== undefined ? { address: String(payload['address']).trim() } : {}),
            ...(payload['state'] !== undefined ? { state: String(payload['state']).trim() } : {}),
            ...(payload['country'] !== undefined ? { country: String(payload['country']).trim().toUpperCase() } : {}),
            ...(payload['postal_code'] !== undefined ? { postal_code: String(payload['postal_code']).trim() } : {}),
        };
        const registration = await sellerService.updateMyRegistration(req.auth.sub, input);
        res.json({ success: true, data: registration });
    }
    catch (err) {
        next(err);
    }
}
// ── Admin handlers ──────────────────────────────────────────────────────────────
async function handleAdminList(req, res, next) {
    try {
        assertValid(req);
        const q = req.query;
        const result = await sellerService.listRegistrations({
            ...(q['status'] !== undefined ? { status: q['status'] } : {}),
            ...(q['page'] !== undefined ? { page: Number(q['page']) } : {}),
            ...(q['limit'] !== undefined ? { limit: Number(q['limit']) } : {}),
        });
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
async function handleAdminGetById(req, res, next) {
    try {
        assertValid(req);
        const { id } = req.params;
        const registration = await sellerService.getRegistrationById(id);
        res.json({ success: true, data: registration });
    }
    catch (err) {
        next(err);
    }
}
function adminActionHandler(action) {
    return async (req, res, next) => {
        try {
            assertValid(req);
            if (!req.auth)
                throw new errors_1.UnauthorizedError();
            const { id } = req.params;
            const { notes } = req.body;
            const ctx = (0, error_middleware_1.extractRequestContext)(req);
            const registration = await action(id, req.auth.sub, notes, ctx);
            res.json({ success: true, data: registration });
        }
        catch (err) {
            next(err);
        }
    };
}
exports.handleApprove = adminActionHandler(sellerService.approveRegistration);
exports.handleReject = adminActionHandler(sellerService.rejectRegistration);
exports.handleSuspend = adminActionHandler(sellerService.suspendRegistration);
exports.handleReactivate = adminActionHandler(sellerService.reactivateRegistration);
//# sourceMappingURL=seller.controller.js.map