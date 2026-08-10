import { reviewRepository } from '../repositories/review.repository'
import { notificationService } from '@/modules/messaging/services/notification.service'
import { ValidationError, ForbiddenError, ConflictError, NotFoundError } from '@/common/errors'
import type { OrderReview, OrderReviewWithContext, ReviewFilters, CreateReviewInput } from '@/common/types/review.types'
import type { PaginatedResult } from '@/common/types/commerce.types'

const FULFILLED_DIGITAL_STATUSES = new Set(['FULFILLED', 'COMPLETED'])

export const reviewService = {
  // ── CanReview ─────────────────────────────────────────────────────────────
  // Exposed as its own endpoint so the frontend can decide whether to show
  // the "leave a review" prompt without attempting (and failing) a create.

  async canReview(orderItemId: string, buyerId: string): Promise<{ eligible: boolean; reason?: string }> {
    const eligibility = await reviewRepository.getEligibility(orderItemId)
    if (!eligibility) return { eligible: false, reason: 'Order item not found' }
    if (eligibility.buyer_id !== buyerId) return { eligible: false, reason: 'Not your order' }
    if (eligibility.already_reviewed) return { eligible: false, reason: 'Already reviewed' }

    const delivered = eligibility.artwork_format === 'PHYSICAL'
      ? eligibility.physical_timeline_status === 'DELIVERED'
      : FULFILLED_DIGITAL_STATUSES.has(eligibility.order_status)

    if (!delivered) return { eligible: false, reason: 'Item has not been delivered yet' }
    return { eligible: true }
  },

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(input: CreateReviewInput & { buyerId: string }): Promise<OrderReview> {
    if (input.rating < 1 || input.rating > 5) {
      throw new ValidationError('Validation failed', { rating: 'rating must be between 1 and 5' })
    }
    if (input.condition_rating !== undefined && (input.condition_rating < 1 || input.condition_rating > 5)) {
      throw new ValidationError('Validation failed', { condition_rating: 'condition_rating must be between 1 and 5' })
    }
    if (input.delivery_rating !== undefined && (input.delivery_rating < 1 || input.delivery_rating > 5)) {
      throw new ValidationError('Validation failed', { delivery_rating: 'delivery_rating must be between 1 and 5' })
    }

    const eligibility = await reviewRepository.getEligibility(input.order_item_id)
    if (!eligibility) throw new NotFoundError('Order item')
    if (eligibility.buyer_id !== input.buyerId) throw new ForbiddenError('This order does not belong to you')
    if (eligibility.already_reviewed) throw new ConflictError('This order item has already been reviewed')

    const delivered = eligibility.artwork_format === 'PHYSICAL'
      ? eligibility.physical_timeline_status === 'DELIVERED'
      : FULFILLED_DIGITAL_STATUSES.has(eligibility.order_status)

    if (!delivered) {
      throw new ConflictError('This item has not been delivered yet — you can review it once delivery is confirmed')
    }

    const review = await reviewRepository.create({
      ...input,
      order_id:   eligibility.order_id,
      artwork_id: eligibility.artwork_id,
      buyer_id:   input.buyerId,
      seller_id:  eligibility.seller_id,
    })

    void notificationService.create({
      recipientId: eligibility.seller_id,
      actorId:     input.buyerId,
      type:        'review',
      entityId:    review.id,
      entityType:  'order_review',
      data: {
        body:          `You received a new ${review.rating}-star review on "${eligibility.artwork_title}".`,
        artwork_id:    eligibility.artwork_id,
        rating:        review.rating,
      },
    }).catch(() => {})

    return review
  },

  // ── ListForSeller (artist dashboard "comment analytics") ───────────────────

  async listForSeller(sellerId: string, filters: Omit<ReviewFilters, 'seller_id'>): Promise<PaginatedResult<OrderReviewWithContext>> {
    return reviewRepository.list({ ...filters, seller_id: sellerId })
  },

  // ── ListForArtwork (public artwork page) ────────────────────────────────────

  async listForArtwork(artworkId: string, filters: Omit<ReviewFilters, 'artwork_id'>): Promise<PaginatedResult<OrderReviewWithContext>> {
    return reviewRepository.list({ ...filters, artwork_id: artworkId })
  },

  // ── GetSellerRatingStats ───────────────────────────────────────────────────

  async getSellerRatingStats(sellerId: string) {
    return reviewRepository.getSellerRatingStats(sellerId)
  },
}
