"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRepository = void 0;
const database_1 = require("../../../config/database");
exports.analyticsRepository = {
    // ── GetPeriodMetrics ─────────────────────────────────────────────────────
    async getPeriodMetrics(sellerId, start, end) {
        const result = await (0, database_1.supabase)().rpc('get_artist_period_metrics', {
            p_seller_id: sellerId,
            p_start: start.toISOString(),
            p_end: end.toISOString(),
        });
        if (result.error) {
            throw new Error(`[Supabase:analytics.getPeriodMetrics] ${result.error.message}`);
        }
        const row = (result.data ?? [])[0] ?? {};
        return {
            earnings: Number(row['earnings'] ?? 0),
            sales_count: Number(row['sales_count'] ?? 0),
            withdrawals: Number(row['withdrawals'] ?? 0),
            views: Number(row['views'] ?? 0),
            likes: Number(row['likes'] ?? 0),
        };
    },
    // ── GetDailyEarnings ───────────────────────────────────────────────────────
    async getDailyEarnings(sellerId, year) {
        const result = await (0, database_1.supabase)().rpc('get_artist_daily_earnings', {
            p_seller_id: sellerId,
            p_year: year,
        });
        if (result.error) {
            throw new Error(`[Supabase:analytics.getDailyEarnings] ${result.error.message}`);
        }
        return (result.data ?? []).map((row) => ({
            day: row['day'],
            amount: Number(row['amount']),
            sales_count: Number(row['sales_count']),
        }));
    },
    // ── GetSalesAnalytics ────────────────────────────────────────────────────────
    async getSalesAnalytics(sellerId, filters) {
        const page = Math.max(1, filters.page ?? 1);
        const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
        const offset = (page - 1) * limit;
        const result = await (0, database_1.supabase)().rpc('get_artist_sales_analytics', {
            p_seller_id: sellerId,
            p_status: filters.status ?? null,
            p_category: filters.category ?? null,
            p_date_from: filters.date_from ?? null,
            p_date_to: filters.date_to ?? null,
            p_price_min: filters.price_min ?? null,
            p_price_max: filters.price_max ?? null,
            p_search: filters.search ?? null,
            p_sort: filters.sort ?? 'newest',
            p_limit: limit,
            p_offset: offset,
        });
        if (result.error) {
            throw new Error(`[Supabase:analytics.getSalesAnalytics] ${result.error.message}`);
        }
        const rows = (result.data ?? []);
        const total = rows.length > 0 ? Number(rows[0]['total_count']) : 0;
        const total_pages = Math.max(1, Math.ceil(total / limit));
        const data = rows.map((row) => ({
            ledger_id: row['ledger_id'],
            order_id: row['order_id'] ?? null,
            order_item_id: row['order_item_id'] ?? null,
            order_number: row['order_number'] ?? null,
            artwork_id: row['artwork_id'] ?? null,
            artwork_name: row['artwork_title'] ?? null,
            artwork_thumbnail: row['artwork_thumbnail'] ?? null,
            artwork_description: row['artwork_description'] ?? null,
            buyer_id: row['buyer_id'] ?? null,
            buyer_name: row['buyer_name'] ?? null,
            amount: Number(row['amount']),
            currency: row['currency_raw'] ?? 'USDT',
            category: row['category'],
            status: row['effective_status'],
            tracking_id: row['tracking_id'] ?? null,
            created_at: new Date(row['created_at']),
        }));
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
    // ── GetArtworkPerformance ─────────────────────────────────────────────────────
    async getArtworkPerformance(sellerId, windowStart, windowEnd) {
        const result = await (0, database_1.supabase)().rpc('get_artist_artwork_performance', {
            p_seller_id: sellerId,
            p_window_start: windowStart.toISOString(),
            p_window_end: windowEnd.toISOString(),
        });
        if (result.error) {
            throw new Error(`[Supabase:analytics.getArtworkPerformance] ${result.error.message}`);
        }
        return (result.data ?? []).map((row) => ({
            artwork_id: row['artwork_id'],
            artwork_title: row['artwork_title'],
            thumbnail_url: row['thumbnail_url'] ?? null,
            earnings: Number(row['earnings']),
            sales_count: Number(row['sales_count']),
            views: Number(row['views']),
            likes: Number(row['likes']),
        }));
    },
    // ── GetReliabilityStats ───────────────────────────────────────────────────────
    async getReliabilityStats(sellerId) {
        const result = await (0, database_1.supabase)().rpc('get_artist_reliability_stats', {
            p_seller_id: sellerId,
        });
        if (result.error) {
            throw new Error(`[Supabase:analytics.getReliabilityStats] ${result.error.message}`);
        }
        const row = (result.data ?? [])[0] ?? {};
        return {
            total_physical_items: Number(row['total_physical_items'] ?? 0),
            delivered_items: Number(row['delivered_items'] ?? 0),
            delivery_failed_items: Number(row['delivery_failed_items'] ?? 0),
            cancelled_items: Number(row['cancelled_items'] ?? 0),
            refunded_items: Number(row['refunded_items'] ?? 0),
        };
    },
    // ── GetLifetimeTotals ─────────────────────────────────────────────────────────
    // Current cumulative view/like counts across every artwork this artist
    // owns — the denormalised snapshot figure shown alongside the trend delta.
    async getLifetimeViewsAndLikes(sellerId) {
        const result = await (0, database_1.supabase)()
            .from('artworks')
            .select('view_count, like_count')
            .eq('creator_id', sellerId)
            .is('deleted_at', null);
        if (result.error) {
            throw new Error(`[Supabase:analytics.getLifetimeViewsAndLikes] ${result.error.message}`);
        }
        const rows = (result.data ?? []);
        return {
            views: rows.reduce((sum, r) => sum + (r.view_count ?? 0), 0),
            likes: rows.reduce((sum, r) => sum + (r.like_count ?? 0), 0),
        };
    },
};
//# sourceMappingURL=analytics.repository.js.map