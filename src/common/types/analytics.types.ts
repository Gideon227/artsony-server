import type { WalletLedgerCategory } from './commerce.types'

// ── Periods ────────────────────────────────────────────────────────────────────

export type AnalyticsPeriod = 'day' | 'week' | '2weeks' | 'month' | '6months' | 'year'

export const PERIOD_DAYS: Record<AnalyticsPeriod, number> = {
  day: 1,
  week: 7,
  '2weeks': 14,
  month: 30,
  '6months': 182,
  year: 365,
}

// ── Trend (increase / decrease / no change vs. a comparable prior period) ──────

export type TrendDirection = 'up' | 'down' | 'flat'

export type MetricTrend = {
  current: number
  previous: number
  change_percent: number
  direction: TrendDirection
}

// ── Sales feed (filters/sort/search shared by the /analytics/sales endpoint) ───

export type SalesAnalyticsStatus = 'pending' | 'hold' | 'completed' | 'cancelled'
export type SalesAnalyticsSort = 'newest' | 'oldest' | 'highest' | 'lowest'

export type SalesAnalyticsFilters = {
  status?: SalesAnalyticsStatus
  category?: WalletLedgerCategory
  date_from?: string
  date_to?: string
  price_min?: number
  price_max?: number
  search?: string   // matches order tracking id, artwork name, or buyer name
  sort?: SalesAnalyticsSort
  page?: number
  limit?: number
}

export type SalesAnalyticsItem = {
  ledger_id: string
  order_id: string | null
  order_item_id: string | null
  order_number: string | null
  artwork_id: string | null
  artwork_name: string | null
  artwork_thumbnail: string | null
  artwork_description: string | null
  buyer_id: string | null
  buyer_name: string | null
  amount: number
  currency: string
  category: WalletLedgerCategory
  status: SalesAnalyticsStatus | 'n/a'
  tracking_id: string | null
  created_at: Date
}

// ── Daily earnings series ───────────────────────────────────────────────────────

export type DailyEarningsPoint = {
  day: string           // YYYY-MM-DD
  amount: number
  sales_count: number
}

// ── Overview (dashboard summary card) ───────────────────────────────────────────

export type AnalyticsOverview = {
  total_earnings: MetricTrend
  available_balance: number
  pending_balance: number
  hold_balance: number
  total_withdrawals: MetricTrend
  total_sales: MetricTrend
  total_views: MetricTrend
  total_likes: MetricTrend
  period: AnalyticsPeriod
}

// ── Top artworks ────────────────────────────────────────────────────────────────

export type TopArtworkMetric = 'earnings' | 'sales' | 'engagement'

export type TopArtwork = {
  artwork_id: string
  artwork_title: string
  thumbnail_url: string | null
  earnings: MetricTrend
  sales: MetricTrend
  engagement: MetricTrend   // views + likes, combined
  views: number
  likes: number
}

// ── Artsony Score ────────────────────────────────────────────────────────────────

export type ArtsonyScoreBreakdown = {
  score: number                      // 0–100 composite
  buyer_satisfaction: {
    score: number                    // 0–100
    average_rating: number | null    // 1–5, null if no reviews yet
    review_count: number
    weight: number
  }
  engagement: {
    score: number                    // 0–100
    total_views: number
    total_likes: number
    engagement_rate: number          // likes / views, 0 if no views
    weight: number
  }
  order_reliability: {
    score: number                    // 0–100
    delivered_items: number
    total_physical_items: number
    delivery_failed_items: number
    cancelled_items: number
    refunded_items: number
    average_condition_rating: number | null
    average_delivery_rating: number | null
    weight: number
  }
  computed_at: Date
}
