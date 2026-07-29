"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listReviewsValidation = exports.createReviewValidation = void 0;
exports.handleCanReview = handleCanReview;
exports.handleCreateReview = handleCreateReview;
exports.handleListForArtwork = handleListForArtwork;
exports.handleListForSeller = handleListForSeller;
const express_validator_1 = require("express-validator");
const review_service_1 = require("../services/review.service");
const errors_1 = require("../../../common/errors");
const object_utils_1 = require("../../../common/utils/object.utils");
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
function requireAuth(req) {
    if (!req.auth)
        throw new errors_1.UnauthorizedError();
    return req.auth;
}
// ── Validation chains ────────────────────────────────────────────────────────────
exports.createReviewValidation = [
    (0, express_validator_1.body)('order_item_id').isUUID(),
    (0, express_validator_1.body)('rating').isInt({ min: 1, max: 5 }),
    (0, express_validator_1.body)('comment').optional().isString().isLength({ max: 2000 }),
    (0, express_validator_1.body)('condition_rating').optional().isInt({ min: 1, max: 5 }),
    (0, express_validator_1.body)('delivery_rating').optional().isInt({ min: 1, max: 5 }),
];
exports.listReviewsValidation = [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    (0, express_validator_1.query)('sort').optional().isIn(['newest', 'oldest', 'highest', 'lowest']),
    (0, express_validator_1.query)('search').optional().isString().trim(),
];
// ── Handlers ───────────────────────────────────────────────────────────────────
async function handleCanReview(req, res, next) {
    try {
        const { sub } = requireAuth(req);
        const { orderItemId } = req.params;
        const result = await review_service_1.reviewService.canReview(orderItemId, sub);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
async function handleCreateReview(req, res, next) {
    try {
        assertValid(req);
        const { sub } = requireAuth(req);
        const { order_item_id, rating, comment, condition_rating, delivery_rating } = req.body;
        const review = await review_service_1.reviewService.create({
            order_item_id,
            rating,
            buyerId: sub,
            ...(0, object_utils_1.compact)({ comment, condition_rating, delivery_rating }),
        });
        res.status(201).json({ success: true, data: review });
    }
    catch (err) {
        next(err);
    }
}
async function handleListForArtwork(req, res, next) {
    try {
        assertValid(req);
        const { artworkId } = req.params;
        const q = req.query;
        const result = await review_service_1.reviewService.listForArtwork(artworkId, (0, object_utils_1.compact)({
            page: q['page'] ? Number(q['page']) : undefined,
            limit: q['limit'] ? Number(q['limit']) : undefined,
            sort: q['sort'],
            search: q['search'],
        }));
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function handleListForSeller(req, res, next) {
    try {
        assertValid(req);
        const { sub } = requireAuth(req);
        const q = req.query;
        const result = await review_service_1.reviewService.listForSeller(sub, (0, object_utils_1.compact)({
            page: q['page'] ? Number(q['page']) : undefined,
            limit: q['limit'] ? Number(q['limit']) : undefined,
            sort: q['sort'],
            search: q['search'],
        }));
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=review.controller.js.map