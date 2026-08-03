import { analyticsRepository } from '../repositories/analytics.repository'
import { walletRepository } from '@/modules/wallet/repositories/wallet.repository'
import { reviewRepository } from '@/modules/review/repositories/review.repository'
import { PERIOD_DAYS } from '@/common/types/analytics.types'
import type {
  AnalyticsPeriod,
  AnalyticsOverview,
  DailyEarningsPoint,
  MetricTrend,
  SalesAnalyticsFilters,
  SalesAnalyticsItem,
  TopArtwork,
  TopArtworkMetric,
  ArtsonyScoreBreakdown,
} from '@/common/types/analytics.types'
import type { PaginatedResult } from '@/common/types/commerce.types'
import { ValidationError } from '@/common/errors'

// ── Trend math ─────────────────────────────────────────────────────────────────
// Shared by every "up/down X% vs previous period" figure in this module.

function computeTrend(current: number, previous: number): MetricTrend {
  let changePercent: number
  if (previous === 0) {
    changePercent = current === 0 ? 0 : 100
  } else {
    changePercent = ((current - previous) / previous) * 100
  }
  changePercent = Math.round(changePercent * 100) / 100

  return {
    current,
    previous,
    change_percent: changePercent,
    direction: changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'flat',
  }
}

function periodWindows(period: AnalyticsPeriod, now = new Date()): {
  currentStart: Date; currentEnd: Date; previousStart: Date; previousEnd: Date
} {
  const days = PERIOD_DAYS[period]
  const ms   = days * 24 * 60 * 60 * 1000
  const currentEnd    = now
  const currentStart  = new Date(now.getTime() - ms)
  const previousEnd   = currentStart
  const previousStart = new Date(currentStart.getTime() - ms)
  return { currentStart, currentEnd, previousStart, previousEnd }
}

// ════════════════════════════════════════════════════════════════════════════
// Artsony Score
//
// Composite 0–100 rating for an artist, weighted:
//   • Buyer satisfaction   40%  — average of order_reviews.rating (1–5)
//   • Order reliability    35%  — delivery success rate, cancellation/refund
//                                 rate, and buyer-reported condition/delivery
//                                 sub-ratings
//   • Engagement           25%  — like-through rate on views, over the last
//                                 90 days
//
// Full worked explanation lives in ARTSONY_SCORE.md — this implementation
// must be kept in lockstep with that document.
// ════════════════════════════════════════════════════════════════════════════

const SCORE_WEIGHTS = {
  buyerSatisfaction: 0.40,
  orderReliability:  0.35,
  engagement:        0.25,
} as const

const ENGAGEMENT_WINDOW_DAYS = 90
const ENGAGEMENT_RATE_CEILING = 0.10   // a 10% like-through rate scores 100
const ENGAGEMENT_MIN_VIEWS_FOR_SIGNAL = 20   // below this, treat as cold-start
const COLD_START_SATISFACTION_SCORE = 70     // no reviews yet — neutral, not punitive
const COLD_START_ENGAGEMENT_SCORE = 50

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function scoreBuyerSatisfaction(averageRating: number | null): number {
  if (averageRating === null) return COLD_START_SATISFACTION_SCORE
  return clamp(((averageRating - 1) / 4) * 100, 0, 100)
}

function scoreEngagement(views: number, likes: number): number {
  if (views < ENGAGEMENT_MIN_VIEWS_FOR_SIGNAL) return COLD_START_ENGAGEMENT_SCORE
  const rate = likes / views
  return clamp((rate / ENGAGEMENT_RATE_CEILING) * 100, 0, 100)
}

function scoreOrderReliability(input: {
  totalPhysical: number
  delivered: number
  deliveryFailed: number
  cancelled: number
  refunded: number
  avgConditionRating: number | null
  avgDeliveryRating: number | null
}): number {
  // Digital-only artists carry no physical delivery risk — reliability
  // defaults to a strong baseline, only pulled down by explicit low
  // condition/delivery sub-ratings if any exist.
  if (input.totalPhysical === 0) {
    const subRatings = [input.avgConditionRating, input.avgDeliveryRating].filter(
      (v): v is number => v !== null
    )
    if (subRatings.length === 0) return 100
    const avg = subRatings.reduce((a, b) => a + b, 0) / subRatings.length
    return clamp(((avg - 1) / 4) * 100, 0, 100)
  }

  const deliverySuccessRate = input.delivered / input.totalPhysical
  const failureRate = (input.deliveryFailed + input.cancelled + input.refunded) / input.totalPhysical

  const deliveryComponent = clamp(deliverySuccessRate * 100, 0, 100)
  const failurePenaltyComponent = clamp(100 - failureRate * 100, 0, 100)

  const subRatings = [input.avgConditionRating, input.avgDeliveryRating].filter(
    (v): v is number => v !== null
  )
  const subRatingComponent = subRatings.length
    ? clamp(((subRatings.reduce((a, b) => a + b, 0) / subRatings.length - 1) / 4) * 100, 0, 100)
    : deliveryComponent // no sub-ratings yet — fall back to delivery success rate

  // 50% delivered-on-time, 30% inverse failure rate, 20% buyer-reported condition/handling
  return deliveryComponent * 0.5 + failurePenaltyComponent * 0.3 + subRatingComponent * 0.2
}

export const analyticsService = {
  // ── Overview ───────────────────────────────────────────────────────────────

  async getOverview(sellerId: string, period: AnalyticsPeriod = 'month'): Promise<AnalyticsOverview> {
    const { currentStart, currentEnd, previousStart, previousEnd } = periodWindows(period)

    const [current, previous, balance] = await Promise.all([
      analyticsRepository.getPeriodMetrics(sellerId, currentStart, currentEnd),
      analyticsRepository.getPeriodMetrics(sellerId, previousStart, previousEnd),
      walletRepository.getBalanceSummary(sellerId),
    ])

    return {
      total_earnings:     computeTrend(current.earnings, previous.earnings),
      available_balance:  balance.available_balance,
      pending_balance:     balance.pending_balance,
      hold_balance:         balance.hold_balance,
      total_withdrawals:  computeTrend(current.withdrawals, previous.withdrawals),
      total_sales:        computeTrend(current.sales_count, previous.sales_count),
      total_views:        computeTrend(current.views, previous.views),
      total_likes:        computeTrend(current.likes, previous.likes),
      period,
    }
  },

  // ── Daily earnings (calendar year) ────────────────────────────────────────

  async getDailyEarnings(sellerId: string, year: number): Promise<DailyEarningsPoint[]> {
    const currentYear = new Date().getFullYear()
    if (year < 2020 || year > currentYear) {
      throw new ValidationError('Validation failed', { year: `year must be between 2020 and ${currentYear}` })
    }
    return analyticsRepository.getDailyEarnings(sellerId, year)
  },

  // ── Sales feed ─────────────────────────────────────────────────────────────

  async getSalesAnalytics(
    sellerId: string,
    filters: SalesAnalyticsFilters
  ): Promise<PaginatedResult<SalesAnalyticsItem>> {
    if (filters.price_min !== undefined && filters.price_max !== undefined && filters.price_min > filters.price_max) {
      throw new ValidationError('Validation failed', { price_min: 'price_min must not exceed price_max' })
    }
    return analyticsRepository.getSalesAnalytics(sellerId, filters)
  },

  // ── Top artworks ───────────────────────────────────────────────────────────

  async getTopArtworks(
    sellerId: string,
    period: AnalyticsPeriod = 'week',
    metric: TopArtworkMetric = 'earnings',
    limit = 5
  ): Promise<TopArtwork[]> {
    const { currentStart, currentEnd, previousStart, previousEnd } = periodWindows(period)

    const [current, previous] = await Promise.all([
      analyticsRepository.getArtworkPerformance(sellerId, currentStart, currentEnd),
      analyticsRepository.getArtworkPerformance(sellerId, previousStart, previousEnd),
    ])

    const previousByArtwork = new Map(previous.map((row) => [row.artwork_id, row]))

    const items: TopArtwork[] = current.map((row) => {
      const prev = previousByArtwork.get(row.artwork_id)
      return {
        artwork_id:    row.artwork_id,
        artwork_title: row.artwork_title,
        thumbnail_url: row.thumbnail_url,
        earnings:      computeTrend(row.earnings, prev?.earnings ?? 0),
        sales:         computeTrend(row.sales_count, prev?.sales_count ?? 0),
        engagement:    computeTrend(row.views + row.likes, (prev?.views ?? 0) + (prev?.likes ?? 0)),
        views:         row.views,
        likes:         row.likes,
      }
    })

    const metricValue = (item: TopArtwork): number =>
      metric === 'earnings' ? item.earnings.current
      : metric === 'sales'  ? item.sales.current
      : item.engagement.current

    return items.sort((a, b) => metricValue(b) - metricValue(a)).slice(0, Math.max(1, Math.min(50, limit)))
  },

  // ── Artsony Score ──────────────────────────────────────────────────────────

  async getArtsonyScore(sellerId: string): Promise<ArtsonyScoreBreakdown> {
    const now = new Date()
    const engagementStart = new Date(now.getTime() - ENGAGEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    const [ratingStats, reliability, engagementMetrics] = await Promise.all([
      reviewRepository.getSellerRatingStats(sellerId),
      analyticsRepository.getReliabilityStats(sellerId),
      analyticsRepository.getPeriodMetrics(sellerId, engagementStart, now),
    ])

    const buyerSatisfactionScore = scoreBuyerSatisfaction(ratingStats.average_rating)
    const engagementScore = scoreEngagement(engagementMetrics.views, engagementMetrics.likes)
    const orderReliabilityScore = scoreOrderReliability({
      totalPhysical:      reliability.total_physical_items,
      delivered:          reliability.delivered_items,
      deliveryFailed:     reliability.delivery_failed_items,
      cancelled:          reliability.cancelled_items,
      refunded:           reliability.refunded_items,
      avgConditionRating: ratingStats.average_condition_rating,
      avgDeliveryRating:  ratingStats.average_delivery_rating,
    })

    const composite =
      buyerSatisfactionScore * SCORE_WEIGHTS.buyerSatisfaction +
      orderReliabilityScore  * SCORE_WEIGHTS.orderReliability +
      engagementScore        * SCORE_WEIGHTS.engagement

    return {
      score: Math.round(composite * 100) / 100,
      buyer_satisfaction: {
        score:          Math.round(buyerSatisfactionScore * 100) / 100,
        average_rating: ratingStats.average_rating,
        review_count:   ratingStats.review_count,
        weight:         SCORE_WEIGHTS.buyerSatisfaction,
      },
      engagement: {
        score:           Math.round(engagementScore * 100) / 100,
        total_views:     engagementMetrics.views,
        total_likes:     engagementMetrics.likes,
        engagement_rate: engagementMetrics.views > 0 ? engagementMetrics.likes / engagementMetrics.views : 0,
        weight:          SCORE_WEIGHTS.engagement,
      },
      order_reliability: {
        score:                     Math.round(orderReliabilityScore * 100) / 100,
        delivered_items:           reliability.delivered_items,
        total_physical_items:      reliability.total_physical_items,
        delivery_failed_items:     reliability.delivery_failed_items,
        cancelled_items:           reliability.cancelled_items,
        refunded_items:            reliability.refunded_items,
        average_condition_rating:  ratingStats.average_condition_rating,
        average_delivery_rating:   ratingStats.average_delivery_rating,
        weight:                    SCORE_WEIGHTS.orderReliability,
      },
      computed_at: now,
    }
  },
}
