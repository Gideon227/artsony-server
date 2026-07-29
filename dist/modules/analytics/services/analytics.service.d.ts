import type { AnalyticsPeriod, AnalyticsOverview, DailyEarningsPoint, SalesAnalyticsFilters, SalesAnalyticsItem, TopArtwork, TopArtworkMetric, ArtsonyScoreBreakdown } from '../../../common/types/analytics.types';
import type { PaginatedResult } from '../../../common/types/commerce.types';
export declare const analyticsService: {
    getOverview(sellerId: string, period?: AnalyticsPeriod): Promise<AnalyticsOverview>;
    getDailyEarnings(sellerId: string, year: number): Promise<DailyEarningsPoint[]>;
    getSalesAnalytics(sellerId: string, filters: SalesAnalyticsFilters): Promise<PaginatedResult<SalesAnalyticsItem>>;
    getTopArtworks(sellerId: string, period?: AnalyticsPeriod, metric?: TopArtworkMetric, limit?: number): Promise<TopArtwork[]>;
    getArtsonyScore(sellerId: string): Promise<ArtsonyScoreBreakdown>;
};
//# sourceMappingURL=analytics.service.d.ts.map