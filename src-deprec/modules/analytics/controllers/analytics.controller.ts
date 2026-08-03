import type { Request, Response, NextFunction } from 'express'
import { query, validationResult } from 'express-validator'
import { analyticsService } from '../services/analytics.service'
import { reviewService } from '@/modules/review/services/review.service'
import { ValidationError, UnauthorizedError, ForbiddenError } from '@/common/errors'
import { compact } from '@/common/utils/object.utils'
import type { AnalyticsPeriod, SalesAnalyticsStatus, SalesAnalyticsSort, TopArtworkMetric } from '@/common/types/analytics.types'
import type { WalletLedgerCategory } from '@/common/types/commerce.types'

const PERIODS = ['day', 'week', '2weeks', 'month', '6months', 'year']

function assertValid(req: Request): void {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const fields = Object.fromEntries(
      errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg])
    )
    throw new ValidationError('Validation failed', fields)
  }
}

// Resolves which artist's analytics are being requested. Artists always see
// their own; ADMIN may pass ?artist_id= to support/debug another artist's
// dashboard — mirrors the existing admin-override pattern used elsewhere
// (e.g. GET /api/wallet/admin/artists/:userId/balance).
function resolveSellerId(req: Request): string {
  if (!req.auth) throw new UnauthorizedError()
  const requested = (req.query['artist_id'] as string | undefined)
  if (!requested || requested === req.auth.sub) return req.auth.sub
  if (req.auth.role !== 'ADMIN') throw new ForbiddenError('Cannot view another artist\'s analytics')
  return requested
}

// ── Validation chains ────────────────────────────────────────────────────────────

export const overviewValidation = [
  query('period').optional().isIn(PERIODS),
  query('artist_id').optional().isUUID(),
]

export const dailyEarningsValidation = [
  query('year').isInt({ min: 2020, max: 2100 }).toInt(),
  query('artist_id').optional().isUUID(),
]

export const salesAnalyticsValidation = [
  query('status').optional().isIn(['pending', 'hold', 'completed', 'cancelled']),
  query('category').optional().isIn(['SALE', 'WITHDRAWAL', 'REFUND', 'ADJUSTMENT']),
  query('date_from').optional().isISO8601(),
  query('date_to').optional().isISO8601(),
  query('price_min').optional().isFloat({ min: 0 }).toFloat(),
  query('price_max').optional().isFloat({ min: 0 }).toFloat(),
  query('search').optional().isString().trim().isLength({ max: 200 }),
  query('sort').optional().isIn(['newest', 'oldest', 'highest', 'lowest']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('artist_id').optional().isUUID(),
]

export const topArtworksValidation = [
  query('period').optional().isIn(PERIODS),
  query('metric').optional().isIn(['earnings', 'sales', 'engagement']),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('artist_id').optional().isUUID(),
]

export const scoreValidation = [
  query('artist_id').optional().isUUID(),
]

export const commentAnalyticsValidation = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sort').optional().isIn(['newest', 'oldest', 'highest', 'lowest']),
  query('search').optional().isString().trim(),
  query('artist_id').optional().isUUID(),
]

// ── Handlers ───────────────────────────────────────────────────────────────────

export async function handleGetOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const sellerId = resolveSellerId(req)
    const period = (req.query['period'] as AnalyticsPeriod | undefined) ?? 'month'
    const overview = await analyticsService.getOverview(sellerId, period)
    res.json({ success: true, data: overview })
  } catch (err) {
    next(err)
  }
}

export async function handleGetDailyEarnings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const sellerId = resolveSellerId(req)
    const year = Number(req.query['year'])
    const series = await analyticsService.getDailyEarnings(sellerId, year)
    res.json({ success: true, data: series, year })
  } catch (err) {
    next(err)
  }
}

export async function handleGetSalesAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const sellerId = resolveSellerId(req)
    const q = req.query as Record<string, string | undefined>

    const result = await analyticsService.getSalesAnalytics(sellerId, compact({
      status:     q['status'] as SalesAnalyticsStatus | undefined,
      category:   q['category'] as WalletLedgerCategory | undefined,
      date_from:  q['date_from'],
      date_to:    q['date_to'],
      price_min:  q['price_min'] ? Number(q['price_min']) : undefined,
      price_max:  q['price_max'] ? Number(q['price_max']) : undefined,
      search:     q['search'],
      sort:       q['sort'] as SalesAnalyticsSort | undefined,
      page:       q['page'] ? Number(q['page']) : undefined,
      limit:      q['limit'] ? Number(q['limit']) : undefined,
    }))

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

export async function handleGetTopArtworks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const sellerId = resolveSellerId(req)
    const period = (req.query['period'] as AnalyticsPeriod | undefined) ?? 'week'
    const metric = (req.query['metric'] as TopArtworkMetric | undefined) ?? 'earnings'
    const limit  = req.query['limit'] ? Number(req.query['limit']) : 5

    const items = await analyticsService.getTopArtworks(sellerId, period, metric, limit)
    res.json({ success: true, data: items, period, metric })
  } catch (err) {
    next(err)
  }
}

export async function handleGetArtsonyScore(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const sellerId = resolveSellerId(req)
    const score = await analyticsService.getArtsonyScore(sellerId)
    res.json({ success: true, data: score })
  } catch (err) {
    next(err)
  }
}

export async function handleGetCommentAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const sellerId = resolveSellerId(req)
    const q = req.query as Record<string, string | undefined>

    const result = await reviewService.listForSeller(sellerId, compact({
      page:   q['page'] ? Number(q['page']) : undefined,
      limit:  q['limit'] ? Number(q['limit']) : undefined,
      sort:   q['sort'] as any,
      search: q['search'],
    }))

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}
