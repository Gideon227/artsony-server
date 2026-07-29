import type { OrderReview, OrderReviewWithContext, ReviewFilters, CreateReviewInput } from '../../../common/types/review.types';
import type { PaginatedResult } from '../../../common/types/commerce.types';
export type ReviewEligibility = {
    order_item_id: string;
    order_id: string;
    buyer_id: string;
    seller_id: string;
    artwork_id: string;
    artwork_title: string;
    artwork_format: 'DIGITAL' | 'PHYSICAL';
    order_status: string;
    physical_timeline_status: string | null;
    already_reviewed: boolean;
};
export declare const reviewRepository: {
    getEligibility(orderItemId: string): Promise<ReviewEligibility | undefined>;
    create(input: CreateReviewInput & {
        order_id: string;
        artwork_id: string;
        buyer_id: string;
        seller_id: string;
    }): Promise<OrderReview>;
    list(filters: ReviewFilters): Promise<PaginatedResult<OrderReviewWithContext>>;
    getSellerRatingStats(sellerId: string): Promise<{
        review_count: number;
        average_rating: number | null;
        average_condition_rating: number | null;
        average_delivery_rating: number | null;
    }>;
};
//# sourceMappingURL=review.repository.d.ts.map