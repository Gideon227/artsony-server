import type { OrderReview, OrderReviewWithContext, ReviewFilters, CreateReviewInput } from '../../../common/types/review.types';
import type { PaginatedResult } from '../../../common/types/commerce.types';
export declare const reviewService: {
    canReview(orderItemId: string, buyerId: string): Promise<{
        eligible: boolean;
        reason?: string;
    }>;
    create(input: CreateReviewInput & {
        buyerId: string;
    }): Promise<OrderReview>;
    listForSeller(sellerId: string, filters: Omit<ReviewFilters, "seller_id">): Promise<PaginatedResult<OrderReviewWithContext>>;
    listForArtwork(artworkId: string, filters: Omit<ReviewFilters, "artwork_id">): Promise<PaginatedResult<OrderReviewWithContext>>;
    getSellerRatingStats(sellerId: string): Promise<{
        review_count: number;
        average_rating: number | null;
        average_condition_rating: number | null;
        average_delivery_rating: number | null;
    }>;
};
//# sourceMappingURL=review.service.d.ts.map