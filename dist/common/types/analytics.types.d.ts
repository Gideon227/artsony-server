import type { WalletLedgerCategory } from './commerce.types';
export type AnalyticsPeriod = 'day' | 'week' | '2weeks' | 'month' | '6months' | 'year';
export declare const PERIOD_DAYS: Record<AnalyticsPeriod, number>;
export type TrendDirection = 'up' | 'down' | 'flat';
export type MetricTrend = {
    current: number;
    previous: number;
    change_percent: number;
    direction: TrendDirection;
};
export type SalesAnalyticsStatus = 'pending' | 'hold' | 'completed' | 'cancelled';
export type SalesAnalyticsSort = 'newest' | 'oldest' | 'highest' | 'lowest';
export type SalesAnalyticsFilters = {
    status?: SalesAnalyticsStatus;
    category?: WalletLedgerCategory;
    date_from?: string;
    date_to?: string;
    price_min?: number;
    price_max?: number;
    search?: string;
    sort?: SalesAnalyticsSort;
    page?: number;
    limit?: number;
};
export type SalesAnalyticsItem = {
    ledger_id: string;
    order_id: string | null;
    order_item_id: string | null;
    order_number: string | null;
    artwork_id: string | null;
    artwork_name: string | null;
    artwork_thumbnail: string | null;
    artwork_description: string | null;
    buyer_id: string | null;
    buyer_name: string | null;
    amount: number;
    currency: string;
    category: WalletLedgerCategory;
    status: SalesAnalyticsStatus | 'n/a';
    tracking_id: string | null;
    created_at: Date;
};
export type DailyEarningsPoint = {
    day: string;
    amount: number;
    sales_count: number;
};
export type AnalyticsOverview = {
    total_earnings: MetricTrend;
    available_balance: number;
    pending_balance: number;
    hold_balance: number;
    total_withdrawals: MetricTrend;
    total_sales: MetricTrend;
    total_views: MetricTrend;
    total_likes: MetricTrend;
    period: AnalyticsPeriod;
};
export type TopArtworkMetric = 'earnings' | 'sales' | 'engagement';
export type TopArtwork = {
    artwork_id: string;
    artwork_title: string;
    thumbnail_url: string | null;
    earnings: MetricTrend;
    sales: MetricTrend;
    engagement: MetricTrend;
    views: number;
    likes: number;
};
export type ArtsonyScoreBreakdown = {
    score: number;
    buyer_satisfaction: {
        score: number;
        average_rating: number | null;
        review_count: number;
        weight: number;
    };
    engagement: {
        score: number;
        total_views: number;
        total_likes: number;
        engagement_rate: number;
        weight: number;
    };
    order_reliability: {
        score: number;
        delivered_items: number;
        total_physical_items: number;
        delivery_failed_items: number;
        cancelled_items: number;
        refunded_items: number;
        average_condition_rating: number | null;
        average_delivery_rating: number | null;
        weight: number;
    };
    computed_at: Date;
};
//# sourceMappingURL=analytics.types.d.ts.map