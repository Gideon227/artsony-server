"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewService = void 0;
const review_repository_1 = require("../repositories/review.repository");
const notification_service_1 = require("../../../modules/messaging/services/notification.service");
const errors_1 = require("../../../common/errors");
const FULFILLED_DIGITAL_STATUSES = new Set(['FULFILLED', 'COMPLETED']);
exports.reviewService = {
    // ── CanReview ─────────────────────────────────────────────────────────────
    // Exposed as its own endpoint so the frontend can decide whether to show
    // the "leave a review" prompt without attempting (and failing) a create.
    async canReview(orderItemId, buyerId) {
        const eligibility = await review_repository_1.reviewRepository.getEligibility(orderItemId);
        if (!eligibility)
            return { eligible: false, reason: 'Order item not found' };
        if (eligibility.buyer_id !== buyerId)
            return { eligible: false, reason: 'Not your order' };
        if (eligibility.already_reviewed)
            return { eligible: false, reason: 'Already reviewed' };
        const delivered = eligibility.artwork_format === 'PHYSICAL'
            ? eligibility.physical_timeline_status === 'DELIVERED'
            : FULFILLED_DIGITAL_STATUSES.has(eligibility.order_status);
        if (!delivered)
            return { eligible: false, reason: 'Item has not been delivered yet' };
        return { eligible: true };
    },
    // ── Create ─────────────────────────────────────────────────────────────────
    async create(input) {
        if (input.rating < 1 || input.rating > 5) {
            throw new errors_1.ValidationError('Validation failed', { rating: 'rating must be between 1 and 5' });
        }
        if (input.condition_rating !== undefined && (input.condition_rating < 1 || input.condition_rating > 5)) {
            throw new errors_1.ValidationError('Validation failed', { condition_rating: 'condition_rating must be between 1 and 5' });
        }
        if (input.delivery_rating !== undefined && (input.delivery_rating < 1 || input.delivery_rating > 5)) {
            throw new errors_1.ValidationError('Validation failed', { delivery_rating: 'delivery_rating must be between 1 and 5' });
        }
        const eligibility = await review_repository_1.reviewRepository.getEligibility(input.order_item_id);
        if (!eligibility)
            throw new errors_1.NotFoundError('Order item');
        if (eligibility.buyer_id !== input.buyerId)
            throw new errors_1.ForbiddenError('This order does not belong to you');
        if (eligibility.already_reviewed)
            throw new errors_1.ConflictError('This order item has already been reviewed');
        const delivered = eligibility.artwork_format === 'PHYSICAL'
            ? eligibility.physical_timeline_status === 'DELIVERED'
            : FULFILLED_DIGITAL_STATUSES.has(eligibility.order_status);
        if (!delivered) {
            throw new errors_1.ConflictError('This item has not been delivered yet — you can review it once delivery is confirmed');
        }
        const review = await review_repository_1.reviewRepository.create({
            ...input,
            order_id: eligibility.order_id,
            artwork_id: eligibility.artwork_id,
            buyer_id: input.buyerId,
            seller_id: eligibility.seller_id,
        });
        void notification_service_1.notificationService.create({
            recipientId: eligibility.seller_id,
            actorId: input.buyerId,
            type: 'comment',
            entityId: review.id,
            entityType: 'order_review',
            data: {
                body: `You received a new ${review.rating}-star review on "${eligibility.artwork_title}".`,
                artwork_id: eligibility.artwork_id,
                rating: review.rating,
            },
        }).catch(() => { });
        return review;
    },
    // ── ListForSeller (artist dashboard "comment analytics") ───────────────────
    async listForSeller(sellerId, filters) {
        return review_repository_1.reviewRepository.list({ ...filters, seller_id: sellerId });
    },
    // ── ListForArtwork (public artwork page) ────────────────────────────────────
    async listForArtwork(artworkId, filters) {
        return review_repository_1.reviewRepository.list({ ...filters, artwork_id: artworkId });
    },
    // ── GetSellerRatingStats ───────────────────────────────────────────────────
    async getSellerRatingStats(sellerId) {
        return review_repository_1.reviewRepository.getSellerRatingStats(sellerId);
    },
};
//# sourceMappingURL=review.service.js.map