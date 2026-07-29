"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commentAnalyticsValidation = exports.scoreValidation = exports.topArtworksValidation = exports.salesAnalyticsValidation = exports.dailyEarningsValidation = exports.overviewValidation = void 0;
exports.handleGetOverview = handleGetOverview;
exports.handleGetDailyEarnings = handleGetDailyEarnings;
exports.handleGetSalesAnalytics = handleGetSalesAnalytics;
exports.handleGetTopArtworks = handleGetTopArtworks;
exports.handleGetArtsonyScore = handleGetArtsonyScore;
exports.handleGetCommentAnalytics = handleGetCommentAnalytics;
const express_validator_1 = require("express-validator");
const analytics_service_1 = require("../services/analytics.service");
const review_service_1 = require("../../../modules/review/services/review.service");
const errors_1 = require("../../../common/errors");
const object_utils_1 = require("../../../common/utils/object.utils");
const PERIODS = ['day', 'week', '2weeks', 'month', '6months', 'year'];
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
// Resolves which artist's analytics are being requested. Artists always see
// their own; ADMIN may pass ?artist_id= to support/debug another artist's
// dashboard — mirrors the existing admin-override pattern used elsewhere
// (e.g. GET /api/wallet/admin/artists/:userId/balance).
function resolveSellerId(req) {
    if (!req.auth)
        throw new errors_1.UnauthorizedError();
    const requested = req.query['artist_id'];
    if (!requested || requested === req.auth.sub)
        return req.auth.sub;
    if (req.auth.role !== 'ADMIN')
        throw new errors_1.ForbiddenError('Cannot view another artist\'s analytics');
    return requested;
}
// ── Validation chains ────────────────────────────────────────────────────────────
exports.overviewValidation = [
    (0, express_validator_1.query)('period').optional().isIn(PERIODS),
    (0, express_validator_1.query)('artist_id').optional().isUUID(),
];
exports.dailyEarningsValidation = [
    (0, express_validator_1.query)('year').isInt({ min: 2020, max: 2100 }).toInt(),
    (0, express_validator_1.query)('artist_id').optional().isUUID(),
];
exports.salesAnalyticsValidation = [
    (0, express_validator_1.query)('status').optional().isIn(['pending', 'hold', 'completed', 'cancelled']),
    (0, express_validator_1.query)('category').optional().isIn(['SALE', 'WITHDRAWAL', 'REFUND', 'ADJUSTMENT']),
    (0, express_validator_1.query)('date_from').optional().isISO8601(),
    (0, express_validator_1.query)('date_to').optional().isISO8601(),
    (0, express_validator_1.query)('price_min').optional().isFloat({ min: 0 }).toFloat(),
    (0, express_validator_1.query)('price_max').optional().isFloat({ min: 0 }).toFloat(),
    (0, express_validator_1.query)('search').optional().isString().trim().isLength({ max: 200 }),
    (0, express_validator_1.query)('sort').optional().isIn(['newest', 'oldest', 'highest', 'lowest']),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    (0, express_validator_1.query)('artist_id').optional().isUUID(),
];
exports.topArtworksValidation = [
    (0, express_validator_1.query)('period').optional().isIn(PERIODS),
    (0, express_validator_1.query)('metric').optional().isIn(['earnings', 'sales', 'engagement']),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    (0, express_validator_1.query)('artist_id').optional().isUUID(),
];
exports.scoreValidation = [
    (0, express_validator_1.query)('artist_id').optional().isUUID(),
];
exports.commentAnalyticsValidation = [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    (0, express_validator_1.query)('sort').optional().isIn(['newest', 'oldest', 'highest', 'lowest']),
    (0, express_validator_1.query)('search').optional().isString().trim(),
    (0, express_validator_1.query)('artist_id').optional().isUUID(),
];
// ── Handlers ───────────────────────────────────────────────────────────────────
async function handleGetOverview(req, res, next) {
    try {
        assertValid(req);
        const sellerId = resolveSellerId(req);
        const period = req.query['period'] ?? 'month';
        const overview = await analytics_service_1.analyticsService.getOverview(sellerId, period);
        res.json({ success: true, data: overview });
    }
    catch (err) {
        next(err);
    }
}
async function handleGetDailyEarnings(req, res, next) {
    try {
        assertValid(req);
        const sellerId = resolveSellerId(req);
        const year = Number(req.query['year']);
        const series = await analytics_service_1.analyticsService.getDailyEarnings(sellerId, year);
        res.json({ success: true, data: series, year });
    }
    catch (err) {
        next(err);
    }
}
async function handleGetSalesAnalytics(req, res, next) {
    try {
        assertValid(req);
        const sellerId = resolveSellerId(req);
        const q = req.query;
        const result = await analytics_service_1.analyticsService.getSalesAnalytics(sellerId, (0, object_utils_1.compact)({
            status: q['status'],
            category: q['category'],
            date_from: q['date_from'],
            date_to: q['date_to'],
            price_min: q['price_min'] ? Number(q['price_min']) : undefined,
            price_max: q['price_max'] ? Number(q['price_max']) : undefined,
            search: q['search'],
            sort: q['sort'],
            page: q['page'] ? Number(q['page']) : undefined,
            limit: q['limit'] ? Number(q['limit']) : undefined,
        }));
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function handleGetTopArtworks(req, res, next) {
    try {
        assertValid(req);
        const sellerId = resolveSellerId(req);
        const period = req.query['period'] ?? 'week';
        const metric = req.query['metric'] ?? 'earnings';
        const limit = req.query['limit'] ? Number(req.query['limit']) : 5;
        const items = await analytics_service_1.analyticsService.getTopArtworks(sellerId, period, metric, limit);
        res.json({ success: true, data: items, period, metric });
    }
    catch (err) {
        next(err);
    }
}
async function handleGetArtsonyScore(req, res, next) {
    try {
        assertValid(req);
        const sellerId = resolveSellerId(req);
        const score = await analytics_service_1.analyticsService.getArtsonyScore(sellerId);
        res.json({ success: true, data: score });
    }
    catch (err) {
        next(err);
    }
}
async function handleGetCommentAnalytics(req, res, next) {
    try {
        assertValid(req);
        const sellerId = resolveSellerId(req);
        const q = req.query;
        const result = await review_service_1.reviewService.listForSeller(sellerId, (0, object_utils_1.compact)({
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
//# sourceMappingURL=analytics.controller.js.map