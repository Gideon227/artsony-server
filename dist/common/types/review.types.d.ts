export type OrderReview = {
    id: string;
    order_item_id: string;
    order_id: string;
    artwork_id: string;
    buyer_id: string;
    seller_id: string;
    rating: number;
    comment: string | null;
    condition_rating: number | null;
    delivery_rating: number | null;
    created_at: Date;
    updated_at: Date;
};
export type OrderReviewWithContext = OrderReview & {
    buyer_name: string;
    artwork_title: string;
};
export type CreateReviewInput = {
    order_item_id: string;
    rating: number;
    comment?: string;
    condition_rating?: number;
    delivery_rating?: number;
};
export type ReviewFilters = {
    seller_id?: string;
    artwork_id?: string;
    search?: string;
    page?: number;
    limit?: number;
    sort?: 'newest' | 'oldest' | 'highest' | 'lowest';
};
//# sourceMappingURL=review.types.d.ts.map