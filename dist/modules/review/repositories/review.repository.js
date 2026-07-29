"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewRepository = void 0;
const database_1 = require("../../../config/database");
function toReview(row) {
    return {
        id: row['id'],
        order_item_id: row['order_item_id'],
        order_id: row['order_id'],
        artwork_id: row['artwork_id'],
        buyer_id: row['buyer_id'],
        seller_id: row['seller_id'],
        rating: row['rating'],
        comment: row['comment'] ?? null,
        condition_rating: row['condition_rating'] ?? null,
        delivery_rating: row['delivery_rating'] ?? null,
        created_at: new Date(row['created_at']),
        updated_at: new Date(row['updated_at']),
    };
}
exports.reviewRepository = {
    // ── GetEligibility ─────────────────────────────────────────────────────────
    // Everything the service needs to decide whether the caller may review
    // this order item, in a single round trip.
    async getEligibility(orderItemId) {
        const itemResult = await (0, database_1.supabase)()
            .from('order_items')
            .select('id, order_id, seller_id, artwork_id, artwork_title, artwork_format')
            .eq('id', orderItemId)
            .single();
        if (itemResult.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(itemResult, 'review.getEligibility.item');
        const item = itemResult.data;
        const orderResult = await (0, database_1.supabase)()
            .from('orders')
            .select('id, buyer_id, status')
            .eq('id', item['order_id'])
            .single();
        (0, database_1.assertNoError)(orderResult, 'review.getEligibility.order');
        const order = orderResult.data;
        let physicalTimelineStatus = null;
        if (item['artwork_format'] === 'PHYSICAL') {
            const physicalResult = await (0, database_1.supabase)()
                .from('order_item_physical')
                .select('timeline_status')
                .eq('order_item_id', orderItemId)
                .maybeSingle();
            physicalTimelineStatus = physicalResult.data?.['timeline_status'] ?? null;
        }
        const existingResult = await (0, database_1.supabase)()
            .from('order_reviews')
            .select('id')
            .eq('order_item_id', orderItemId)
            .maybeSingle();
        return {
            order_item_id: item['id'],
            order_id: item['order_id'],
            buyer_id: order['buyer_id'],
            seller_id: item['seller_id'],
            artwork_id: item['artwork_id'],
            artwork_title: item['artwork_title'],
            artwork_format: item['artwork_format'],
            order_status: order['status'],
            physical_timeline_status: physicalTimelineStatus,
            already_reviewed: Boolean(existingResult.data),
        };
    },
    // ── Create ─────────────────────────────────────────────────────────────────
    async create(input) {
        const result = await (0, database_1.supabase)()
            .from('order_reviews')
            .insert({
            order_item_id: input.order_item_id,
            order_id: input.order_id,
            artwork_id: input.artwork_id,
            buyer_id: input.buyer_id,
            seller_id: input.seller_id,
            rating: input.rating,
            comment: input.comment ?? null,
            condition_rating: input.condition_rating ?? null,
            delivery_rating: input.delivery_rating ?? null,
        })
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'review.create');
        return toReview(result.data);
    },
    // ── List (seller-scoped "comment analytics", or artwork-scoped) ────────────
    async list(filters) {
        const page = Math.max(1, filters.page ?? 1);
        const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        let query = (0, database_1.supabase)()
            .from('order_reviews')
            .select('*, order_items!inner(artwork_title), users!buyer_id(email)', { count: 'exact' });
        if (filters.seller_id)
            query = query.eq('seller_id', filters.seller_id);
        if (filters.artwork_id)
            query = query.eq('artwork_id', filters.artwork_id);
        const ascending = filters.sort === 'oldest' || filters.sort === 'lowest';
        const orderCol = (filters.sort === 'highest' || filters.sort === 'lowest') ? 'rating' : 'created_at';
        query = query.order(orderCol, { ascending }).range(from, to);
        const result = await query;
        if (result.error) {
            throw new Error(`[Supabase:review.list] ${result.error.message}`);
        }
        let rows = (result.data ?? []);
        if (filters.search) {
            const needle = filters.search.toLowerCase();
            rows = rows.filter((row) => (row['comment'] ?? '').toLowerCase().includes(needle) ||
                (row['users']?.['email'] ?? '').toLowerCase().includes(needle) ||
                (row['order_items']?.['artwork_title'] ?? '').toLowerCase().includes(needle));
        }
        const data = rows.map((row) => ({
            ...toReview(row),
            buyer_name: row['users']?.['email'] ?? 'Unknown buyer',
            artwork_title: row['order_items']?.['artwork_title'] ?? 'Unknown artwork',
        }));
        const total = filters.search ? data.length : (result.count ?? 0);
        const total_pages = Math.max(1, Math.ceil(total / limit));
        return {
            data,
            total,
            page,
            limit,
            total_pages,
            has_next: page < total_pages,
            has_prev: page > 1,
        };
    },
    // ── GetSellerRatingStats ───────────────────────────────────────────────────
    // Feeds the Artsony Score's buyer_satisfaction and order_reliability
    // sub-scores.
    async getSellerRatingStats(sellerId) {
        const result = await (0, database_1.supabase)()
            .from('order_reviews')
            .select('rating, condition_rating, delivery_rating')
            .eq('seller_id', sellerId);
        (0, database_1.assertNoError)(result, 'review.getSellerRatingStats');
        const rows = (result.data ?? []);
        if (rows.length === 0) {
            return {
                review_count: 0,
                average_rating: null,
                average_condition_rating: null,
                average_delivery_rating: null,
            };
        }
        const avg = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
        return {
            review_count: rows.length,
            average_rating: avg(rows.map((r) => r.rating)),
            average_condition_rating: avg(rows.map((r) => r.condition_rating).filter((v) => v !== null)),
            average_delivery_rating: avg(rows.map((r) => r.delivery_rating).filter((v) => v !== null)),
        };
    },
};
//# sourceMappingURL=review.repository.js.map