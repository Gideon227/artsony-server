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
exports.reportArtworkValidation = exports.purchasableArtworkValidation = exports.getTopPicksValidation = exports.featuredArtworksValidation = exports.getFeedValidation = exports.listArtworksValidation = exports.flagArtworkValidation = exports.updateArtworkValidation = exports.createArtworkValidation = void 0;
exports.handleCreateArtwork = handleCreateArtwork;
exports.handleGetArtwork = handleGetArtwork;
exports.handleToggleLike = handleToggleLike;
exports.handleGetArtworkBySlug = handleGetArtworkBySlug;
exports.handleGetFeed = handleGetFeed;
exports.handleGetFeaturedArtworks = handleGetFeaturedArtworks;
exports.handleGetTopPicks = handleGetTopPicks;
exports.handleGetLocations = handleGetLocations;
exports.handleGetSizeLabels = handleGetSizeLabels;
exports.handleListArtworks = handleListArtworks;
exports.handleUpdateArtwork = handleUpdateArtwork;
exports.handlePublishArtwork = handlePublishArtwork;
exports.handleArchiveArtwork = handleArchiveArtwork;
exports.handleDeleteArtwork = handleDeleteArtwork;
exports.handleFlagArtwork = handleFlagArtwork;
exports.handleGetPurchasableArtwork = handleGetPurchasableArtwork;
exports.handleToggleSave = handleToggleSave;
exports.handleReportArtwork = handleReportArtwork;
const express_validator_1 = require("express-validator");
const artworkService = __importStar(require("../services/artwork.service"));
const error_middleware_1 = require("../../../middleware/error.middleware");
const errors_1 = require("../../../common/errors");
// ── Validation helper (mirrors auth.controller.ts pattern) ────────────────────
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
// ── Reusable sub-chains ───────────────────────────────────────────────────────
const isProduction = process.env['NODE_ENV'] === 'production';
const assetValidation = [
    (0, express_validator_1.body)('assets').isArray({ min: 0 }).withMessage('assets must be an array'),
    (0, express_validator_1.body)('assets.*.original_url')
        .isURL({ require_tld: isProduction, require_protocol: true, protocols: isProduction ? ['https'] : ['http', 'https'] })
        .withMessage('Each asset must have a valid HTTPS original_url'),
    (0, express_validator_1.body)('assets.*.media_type')
        .isIn(['IMAGE', 'VIDEO', 'THREE_D', 'EXTERNAL_LINK'])
        .withMessage('Invalid asset media_type'),
    (0, express_validator_1.body)('assets.*.mime_type').isString().notEmpty().withMessage('mime_type is required'),
    (0, express_validator_1.body)('assets.*.file_size_bytes').isInt({ min: 1 }).withMessage('file_size_bytes must be a positive integer'),
    (0, express_validator_1.body)('assets.*.ordering_index').optional().isInt({ min: 0 }),
    (0, express_validator_1.body)('assets.*.width').optional().isInt({ min: 1 }),
    (0, express_validator_1.body)('assets.*.height').optional().isInt({ min: 1 }),
    (0, express_validator_1.body)('assets.*.duration_secs').optional().isFloat({ min: 0 }),
];
const variantValidation = [
    (0, express_validator_1.body)('variants').optional().isArray(),
    (0, express_validator_1.body)('variants.*.type')
        .optional()
        .isIn(['SIZE', 'COLOR', 'MATERIAL', 'FRAMING', 'EDITION'])
        .withMessage('Invalid variant type'),
    (0, express_validator_1.body)('variants.*.name').optional().isString().notEmpty().trim(),
    (0, express_validator_1.body)('variants.*.options').optional().isArray({ min: 1 }),
    (0, express_validator_1.body)('variants.*.options.*.label').optional().isString().notEmpty().trim(),
    (0, express_validator_1.body)('variants.*.options.*.price_modifier').optional().isFloat(),
    (0, express_validator_1.body)('variants.*.options.*.stock').optional().isInt({ min: 0 }),
    (0, express_validator_1.body)('variants.*.options.*.max_order').optional().isInt({ min: 1 }),
    (0, express_validator_1.body)('variants.*.options.*.is_available').optional().isBoolean(),
];
const physicalValidation = [
    (0, express_validator_1.body)('physical_details.length').optional().isFloat({ min: 0.01 }),
    (0, express_validator_1.body)('physical_details.width').optional().isFloat({ min: 0.01 }),
    (0, express_validator_1.body)('physical_details.height').optional().isFloat({ min: 0.01 }),
    (0, express_validator_1.body)('physical_details.unit').optional().isIn(['cm', 'in']),
    (0, express_validator_1.body)('physical_details.available_quantity').optional().isInt({ min: 0 }),
    (0, express_validator_1.body)('physical_details.max_order').optional().isInt({ min: 1 }),
    (0, express_validator_1.body)('physical_details.shipping_regions').optional().isArray(),
    (0, express_validator_1.body)('physical_details.ships_worldwide').optional().isBoolean(),
];
// ── Exported validation chains ─────────────────────────────────────────────────
exports.createArtworkValidation = [
    (0, express_validator_1.body)('listing_type')
        .isIn(['MARKETPLACE', 'PORTFOLIO'])
        .withMessage('listing type must be MARKETPLACE or PORTFOLIO'),
    (0, express_validator_1.body)('artwork_format')
        .isIn(['DIGITAL', 'PHYSICAL'])
        .withMessage('artwork format must be DIGITAL or PHYSICAL'),
    (0, express_validator_1.body)('title')
        .isString().trim().isLength({ min: 1, max: 300 })
        .withMessage('title must be 1–300 characters'),
    (0, express_validator_1.body)('description')
        .isString().trim().isLength({ min: 1, max: 10000 })
        .withMessage('description must be 1–10000 characters'),
    (0, express_validator_1.body)('categories')
        .optional().isArray({ max: 20 })
        .withMessage('categories must be an array of up to 20 items'),
    (0, express_validator_1.body)('categories.*')
        .optional().isString().trim().isLength({ min: 1, max: 80 }),
    (0, express_validator_1.body)('keywords')
        .optional().isArray({ max: 30 })
        .withMessage('keywords must be an array of up to 30 items'),
    (0, express_validator_1.body)('keywords.*')
        .optional().isString().trim().isLength({ min: 1, max: 80 }),
    (0, express_validator_1.body)('collaborator_ids')
        .optional().isArray({ max: 10 })
        .withMessage('at most 10 collaborators allowed'),
    (0, express_validator_1.body)('collaborator_ids.*')
        .optional().isUUID().withMessage('Each collaborator_id must be a valid UUID'),
    (0, express_validator_1.body)('tools_used')
        .optional().isArray({ max: 20 }),
    (0, express_validator_1.body)('tools_used.*')
        .optional().isString().trim().isLength({ min: 1, max: 100 }),
    (0, express_validator_1.body)('visibility')
        .optional().isIn(['PUBLIC', 'PRIVATE', 'UNLISTED'])
        .withMessage('visibility must be PUBLIC, PRIVATE, or UNLISTED'),
    (0, express_validator_1.body)('allow_moodboard_save').optional().isBoolean(),
    (0, express_validator_1.body)('allow_comments').optional().isBoolean(),
    (0, express_validator_1.body)('allow_likes').optional().isBoolean(),
    (0, express_validator_1.body)('show_engagement_stats').optional().isBoolean(),
    (0, express_validator_1.body)('price')
        .optional().isFloat({ min: 0 })
        .withMessage('price must be a non-negative number'),
    (0, express_validator_1.body)('currency')
        .optional().isString().trim().isLength({ min: 3, max: 10 }),
    (0, express_validator_1.body)('max_purchase_quantity')
        .optional().isInt({ min: 1 })
        .withMessage('max_purchase_quantity must be a positive integer'),
    (0, express_validator_1.body)('has_variants')
        .optional().isBoolean(),
    ...assetValidation,
    ...variantValidation,
    ...physicalValidation,
];
exports.updateArtworkValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid artwork id'),
    (0, express_validator_1.body)('title')
        .optional().isString().trim().isLength({ min: 1, max: 300 }),
    (0, express_validator_1.body)('description')
        .optional().isString().trim().isLength({ min: 1, max: 10000 }),
    (0, express_validator_1.body)('categories')
        .optional().isArray({ max: 20 }),
    (0, express_validator_1.body)('categories.*')
        .optional().isString().trim().isLength({ min: 1, max: 80 }),
    (0, express_validator_1.body)('keywords')
        .optional().isArray({ max: 30 }),
    (0, express_validator_1.body)('keywords.*')
        .optional().isString().trim().isLength({ min: 1, max: 80 }),
    (0, express_validator_1.body)('collaborator_ids')
        .optional().isArray({ max: 10 }),
    (0, express_validator_1.body)('collaborator_ids.*')
        .optional().isUUID(),
    (0, express_validator_1.body)('tools_used')
        .optional().isArray({ max: 20 }),
    (0, express_validator_1.body)('visibility')
        .optional().isIn(['PUBLIC', 'PRIVATE', 'UNLISTED']),
    (0, express_validator_1.body)('allow_moodboard_save').optional().isBoolean(),
    (0, express_validator_1.body)('allow_comments').optional().isBoolean(),
    (0, express_validator_1.body)('allow_likes').optional().isBoolean(),
    (0, express_validator_1.body)('show_engagement_stats').optional().isBoolean(),
    (0, express_validator_1.body)('price')
        .optional().isFloat({ min: 0 }),
    (0, express_validator_1.body)('currency')
        .optional().isString().trim().isLength({ min: 3, max: 10 }),
    (0, express_validator_1.body)('max_purchase_quantity')
        .optional().isInt({ min: 1 }),
    (0, express_validator_1.body)('has_variants').optional().isBoolean(),
    ...assetValidation,
    ...variantValidation,
    ...physicalValidation,
];
exports.flagArtworkValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid artwork id'),
    (0, express_validator_1.body)('notes')
        .isString().trim().isLength({ min: 1, max: 2000 })
        .withMessage('Moderation notes are required'),
    (0, express_validator_1.body)('moderation_status')
        .isIn(['APPROVED', 'REJECTED', 'FLAGGED'])
        .withMessage('moderation_status must be APPROVED, REJECTED, or FLAGGED'),
];
exports.listArtworksValidation = [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 50 }),
    (0, express_validator_1.query)('sort_by')
        .optional()
        .isIn(['created_at', 'like_count', 'view_count', 'price']),
    (0, express_validator_1.query)('sort_order').optional().isIn(['asc', 'desc']),
    (0, express_validator_1.query)('listing_type').optional().isIn(['MARKETPLACE', 'PORTFOLIO']),
    (0, express_validator_1.query)('artwork_format').optional().isIn(['DIGITAL', 'PHYSICAL']),
    (0, express_validator_1.query)('status').optional().isIn(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'UNDER_REVIEW']),
    (0, express_validator_1.query)('visibility').optional().isIn(['PUBLIC', 'PRIVATE', 'UNLISTED']),
    (0, express_validator_1.query)('min_price').optional().isFloat({ min: 0 }),
    (0, express_validator_1.query)('max_price').optional().isFloat({ min: 0 }),
    (0, express_validator_1.query)('search').optional().isString().trim().isLength({ max: 200 }),
    (0, express_validator_1.query)('categories').optional(),
    (0, express_validator_1.query)('creator_id').optional().isUUID(),
    (0, express_validator_1.query)('location').optional().isString().trim().isLength({ max: 100 }),
    (0, express_validator_1.query)('size_label').optional().isString().trim().isLength({ max: 50 }),
];
// ── Handlers ──────────────────────────────────────────────────────────────────
async function handleCreateArtwork(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const body = req.body;
        const input = {
            listing_type: body['listing_type'],
            artwork_format: body['artwork_format'],
            title: String(body['title']).trim(),
            description: String(body['description']).trim(),
            categories: body['categories'] ?? [],
            keywords: body['keywords'] ?? [],
            collaborator_ids: body['collaborator_ids'] ?? [],
            tools_used: body['tools_used'] ?? [],
            assets: body['assets'] ?? [],
            visibility: body['visibility'] ?? 'PUBLIC',
            allow_moodboard_save: body['allow_moodboard_save'] ?? true,
            allow_comments: body['allow_comments'] ?? true,
            allow_likes: body['allow_likes'] ?? true,
            show_engagement_stats: body['show_engagement_stats'] ?? true,
            has_variants: body['has_variants'] ?? false,
            status: String(body['status']),
            ...(body['price'] !== undefined ? { price: Number(body['price']) } : {}),
            ...(body['currency'] !== undefined ? { currency: String(body['currency']) } : {}),
            ...(body['max_purchase_quantity'] !== undefined ? { max_purchase_quantity: Number(body['max_purchase_quantity']) } : {}),
            ...(body['physical_details'] !== undefined ? { physical_details: body['physical_details'] } : {}),
            ...(body['variants'] !== undefined ? { variants: body['variants'] } : {}),
        };
        const artwork = await artworkService.createArtwork(input, req.auth.sub, req.auth.role);
        res.status(201).json({ success: true, data: artwork });
    }
    catch (err) {
        next(err);
    }
}
async function handleGetArtwork(req, res, next) {
    try {
        const { id } = req.params;
        const artwork = await artworkService.getArtworkById(id, req.auth?.sub);
        const { ctx } = { ctx: (0, error_middleware_1.extractRequestContext)(req) };
        const identity = req.auth?.sub ?? ctx.ipAddress ?? 'anonymous';
        void artworkService.trackView(id, identity).catch((err) => {
            console.error(`[Analytics Error] Failed to track view for artwork ${id}:`, err);
        });
        res.json({ success: true, data: artwork });
    }
    catch (err) {
        next(err);
    }
}
async function handleToggleLike(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const result = await artworkService.toggleLike(id, req.auth.sub);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
async function handleGetArtworkBySlug(req, res, next) {
    try {
        const { slug } = req.params;
        const artwork = await artworkService.getArtworkBySlug(slug, req.auth?.sub);
        const { ctx } = { ctx: (0, error_middleware_1.extractRequestContext)(req) };
        const identity = req.auth?.sub ?? ctx.ipAddress ?? 'anonymous';
        void artworkService.trackView(artwork.id, identity).catch((err) => {
            console.error(`[Analytics Error] Failed to track view for artwork ${artwork.id}:`, err);
        });
        res.json({ success: true, data: artwork });
    }
    catch (err) {
        next(err);
    }
}
exports.getFeedValidation = [
    (0, express_validator_1.query)('mode').isIn(['for_you', 'following', 'new', 'trending', 'newbies']),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    (0, express_validator_1.query)('categories').optional(),
    (0, express_validator_1.query)('location').optional().isString().trim().isLength({ max: 100 }),
    (0, express_validator_1.query)('size_label').optional().isString().trim().isLength({ max: 50 }),
];
async function handleGetFeed(req, res, next) {
    try {
        assertValid(req);
        const q = req.query;
        const mode = q['mode'];
        const filters = {
            ...(q['page'] ? { page: Number(q['page']) } : {}),
            ...(q['limit'] ? { limit: Number(q['limit']) } : {}),
            ...(q['categories']
                ? { categories: Array.isArray(q['categories']) ? q['categories'] : [q['categories']] }
                : {}),
            ...(q['location'] ? { location: q['location'] } : {}),
            ...(q['size_label'] ? { size_label: q['size_label'] } : {}),
        };
        const result = await artworkService.getFeed(mode, filters, req.auth?.sub);
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
// Public, unauthenticated — see artworkService.getFeaturedArtworks for the
// selection algorithm.
exports.featuredArtworksValidation = [
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 10 }).withMessage('limit must be 1–10'),
];
async function handleGetFeaturedArtworks(req, res, next) {
    try {
        assertValid(req);
        const limit = req.query['limit'] ? Number(req.query['limit']) : 5;
        const data = await artworkService.getFeaturedArtworks(limit);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
}
exports.getTopPicksValidation = [
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 20 }).toInt(),
    (0, express_validator_1.query)('period').optional().isIn(['all', 'week']),
    (0, express_validator_1.query)('listingType').optional().isIn(['MARKETPLACE', 'PORTFOLIO']),
];
async function handleGetTopPicks(req, res, next) {
    try {
        assertValid(req);
        const limit = req.query['limit'] ?? 8;
        const period = req.query['period'] ?? 'all';
        const listingType = req.query['listingType'];
        const data = await artworkService.getTopPicks(limit, period, listingType);
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
}
async function handleGetLocations(_req, res, next) {
    try {
        const data = await artworkService.getLocations();
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
}
async function handleGetSizeLabels(_req, res, next) {
    try {
        const data = await artworkService.getSizeLabels();
        res.json({ success: true, data });
    }
    catch (err) {
        next(err);
    }
}
async function handleListArtworks(req, res, next) {
    try {
        assertValid(req);
        const q = req.query;
        // Build the clean filters payload, then safely assert as ArtworkFilters
        const filters = {
            ...(q['page'] ? { page: Number(q['page']) } : {}),
            ...(q['limit'] ? { limit: Number(q['limit']) } : {}),
            ...(q['sort_by'] ? { sort_by: q['sort_by'] } : {}),
            ...(q['sort_order'] ? { sort_order: q['sort_order'] } : {}),
            ...(q['listing_type'] ? { listing_type: q['listing_type'] } : {}),
            ...(q['artwork_format'] ? { artwork_format: q['artwork_format'] } : {}),
            ...(q['status'] ? { status: q['status'] } : {}),
            ...(q['visibility'] ? { visibility: q['visibility'] } : {}),
            ...(q['creator_id'] ? { creator_id: q['creator_id'] } : {}),
            ...(q['search'] ? { search: q['search'] } : {}),
            ...(q['min_price'] !== undefined && q['min_price'] !== '' ? { min_price: Number(q['min_price']) } : {}),
            ...(q['max_price'] !== undefined && q['max_price'] !== '' ? { max_price: Number(q['max_price']) } : {}),
            ...(q['categories']
                ? {
                    categories: Array.isArray(q['categories'])
                        ? q['categories']
                        : [q['categories']],
                }
                : {}),
            ...(q['location'] ? { location: q['location'] } : {}),
            ...(q['size_label'] ? { size_label: q['size_label'] } : {}),
        };
        const result = await artworkService.listArtworks(filters, req.auth?.sub, req.auth?.role);
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function handleUpdateArtwork(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const body = req.body;
        const input = {};
        if (body['title'] !== undefined)
            input.title = String(body['title']).trim();
        if (body['description'] !== undefined)
            input.description = String(body['description']).trim();
        if (body['categories'] !== undefined)
            input.categories = body['categories'];
        if (body['keywords'] !== undefined)
            input.keywords = body['keywords'];
        if (body['collaborator_ids'] !== undefined)
            input.collaborator_ids = body['collaborator_ids'];
        if (body['tools_used'] !== undefined)
            input.tools_used = body['tools_used'];
        if (body['assets'] !== undefined)
            input.assets = body['assets'];
        if (body['visibility'] !== undefined)
            input.visibility = body['visibility'];
        if (body['allow_moodboard_save'] !== undefined)
            input.allow_moodboard_save = body['allow_moodboard_save'];
        if (body['allow_comments'] !== undefined)
            input.allow_comments = body['allow_comments'];
        if (body['allow_likes'] !== undefined)
            input.allow_likes = body['allow_likes'];
        if (body['show_engagement_stats'] !== undefined)
            input.show_engagement_stats = body['show_engagement_stats'];
        if (body['price'] !== undefined)
            input.price = Number(body['price']);
        if (body['currency'] !== undefined)
            input.currency = body['currency'];
        if (body['max_purchase_quantity'] !== undefined)
            input.max_purchase_quantity = Number(body['max_purchase_quantity']);
        if (body['physical_details'] !== undefined)
            input.physical_details = body['physical_details'];
        if (body['has_variants'] !== undefined)
            input.has_variants = body['has_variants'];
        if (body['variants'] !== undefined)
            input.variants = body['variants'];
        const artwork = await artworkService.updateArtwork(id, input, req.auth.sub, req.auth.role);
        res.json({ success: true, data: artwork });
    }
    catch (err) {
        next(err);
    }
}
async function handlePublishArtwork(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const artwork = await artworkService.publishArtwork(id, req.auth.sub, req.auth.role);
        res.json({ success: true, data: artwork });
    }
    catch (err) {
        next(err);
    }
}
async function handleArchiveArtwork(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const artwork = await artworkService.archiveArtwork(id, req.auth.sub, req.auth.role);
        res.json({ success: true, data: artwork });
    }
    catch (err) {
        next(err);
    }
}
async function handleDeleteArtwork(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        await artworkService.deleteArtwork(id, req.auth.sub, req.auth.role);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
}
async function handleFlagArtwork(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const isModerator = req.auth.role === 'MODERATOR' || req.auth.role === 'ADMIN';
        if (!isModerator)
            throw new errors_1.ForbiddenError('Insufficient permissions');
        const { id } = req.params;
        const body = req.body;
        const artwork = await artworkService.flagArtwork(id, req.auth.sub, body.notes, body['moderation_status']);
        res.json({ success: true, data: artwork });
    }
    catch (err) {
        next(err);
    }
}
// ── Store: purchasable artwork fetch ─────────────────────────────────────────
// Used exclusively by the store product page and cart add-item flow.
// Returns the artwork only when it passes every purchasability check.
// Guests can call this — the store is publicly browsable.
exports.purchasableArtworkValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid artwork id'),
];
async function handleGetPurchasableArtwork(req, res, next) {
    try {
        assertValid(req);
        const { id } = req.params;
        const artwork = await artworkService.getPurchasableArtwork(id);
        res.json({ success: true, data: artwork });
    }
    catch (err) {
        next(err);
    }
}
async function handleToggleSave(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const result = await artworkService.toggleSave(id, req.auth.sub);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
}
exports.reportArtworkValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid artwork id'),
    (0, express_validator_1.body)('reason')
        .isIn(['COPYRIGHT', 'INAPPROPRIATE', 'SPAM', 'MISLEADING', 'HARASSMENT', 'OTHER'])
        .withMessage('Invalid report reason'),
    (0, express_validator_1.body)('notes').optional().isString().trim().isLength({ max: 1000 }),
];
async function handleReportArtwork(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const { reason, notes } = req.body;
        await artworkService.reportArtwork(id, req.auth.sub, reason, notes);
        res.status(201).json({ success: true, message: 'Report submitted' });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=artwork.controller.js.map