import type { DailyEarningsPoint, SalesAnalyticsFilters, SalesAnalyticsItem } from '../../../common/types/analytics.types';
import type { PaginatedResult } from '../../../common/types/commerce.types';
export type PeriodMetrics = {
    earnings: number;
    sales_count: number;
    withdrawals: number;
    views: number;
    likes: number;
};
export type ArtworkPerformanceRow = {
    artwork_id: string;
    artwork_title: string;
    thumbnail_url: string | null;
    earnings: number;
    sales_count: number;
    views: number;
    likes: number;
};
export type ReliabilityStats = {
    total_physical_items: number;
    delivered_items: number;
    delivery_failed_items: number;
    cancelled_items: number;
    refunded_items: number;
};
export declare const analyticsRepository: {
    getPeriodMetrics(sellerId: string, start: Date, end: Date): Promise<PeriodMetrics>;
    getDailyEarnings(sellerId: string, year: number): Promise<DailyEarningsPoint[]>;
    getSalesAnalytics(sellerId: string, filters: SalesAnalyticsFilters): Promise<PaginatedResult<SalesAnalyticsItem>>;
    getArtworkPerformance(sellerId: string, windowStart: Date, windowEnd: Date): Promise<ArtworkPerformanceRow[]>;
    getReliabilityStats(sellerId: string): Promise<ReliabilityStats>;
    getLifetimeViewsAndLikes(sellerId: string): Promise<{
        views: number;
        likes: number;
    }>;
};
//# sourceMappingURL=analytics.repository.d.ts.map