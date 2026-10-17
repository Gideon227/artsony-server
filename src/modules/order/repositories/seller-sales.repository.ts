import { supabase } from '../../../config/database'
import type { PaginatedResult } from '../../../common/types/commerce.types'
import {
  SELLER_STATUSES,
  type SellerSaleLine,
  type SellerSalesCounts,
  type SellerSalesFilters,
} from '../../../common/types/seller-sales.types'
import {
  SELLER_SALES_DEFAULT_LIMIT,
  escapeLike,
  pageRange,
  searchTokens,
} from '../utils/seller-sales-query'

const VIEW = 'seller_sales_view'

const COLUMNS = [
  'order_item_id', 'order_id', 'physical_id', 'order_code', 'legacy_code',
  'artwork_id', 'artwork_title', 'artwork_thumbnail_url', 'artwork_format',
  'quantity', 'unit_price', 'line_total', 'currency', 'buyer_name',
  'seller_status', 'timeline_status', 'delivery_status', 'purchased_at',
].join(',')

const RANGE_NOT_SATISFIABLE = 'PGRST103'

function toLine(row: Record<string, any>): SellerSaleLine {
  return {
    ...(row as SellerSaleLine),
    quantity: Number(row['quantity']),
    unit_price: Number(row['unit_price']),
    line_total: Number(row['line_total']),
  }
}

function applyFilters(builder: any, sellerId: string, filters: SellerSalesFilters): any {
  let next = builder.eq('seller_id', sellerId)
  if (filters.status) next = next.eq('seller_status', filters.status)
  if (filters.format) next = next.eq('artwork_format', filters.format)
  if (filters.price_min !== undefined) next = next.gte('line_total', filters.price_min)
  if (filters.price_max !== undefined) next = next.lt('line_total', filters.price_max)
  if (filters.date_from) next = next.gte('purchased_at', filters.date_from)
  if (filters.date_to) next = next.lte('purchased_at', filters.date_to)
  for (const token of searchTokens(filters.q)) {
    next = next.ilike('search_text', `%${escapeLike(token)}%`)
  }
  return next
}

function buildPage(
  data: SellerSaleLine[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<SellerSaleLine> {
  return {
    data,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
    has_next: page * limit < total,
    has_prev: page > 1,
  }
}

async function countMatching(sellerId: string, filters: SellerSalesFilters): Promise<number> {
  const result = await applyFilters(
    (supabase() as any).from(VIEW).select('order_item_id', { count: 'exact', head: true }),
    sellerId,
    filters,
  )
  if (result.error) throw new Error(`[sellerSales:count] ${result.error.message}`)
  return result.count ?? 0
}

export const sellerSalesRepository = {
  async list(sellerId: string, filters: SellerSalesFilters): Promise<PaginatedResult<SellerSaleLine>> {
    const page = filters.page ?? 1
    const limit = filters.limit ?? SELLER_SALES_DEFAULT_LIMIT
    const ascending = filters.sort_order === 'asc'
    const { from, to } = pageRange(page, limit)

    const result = await applyFilters(
      (supabase() as any).from(VIEW).select(COLUMNS, { count: 'exact' }),
      sellerId,
      filters,
    )
      .order('purchased_at', { ascending })
      .order('order_item_id', { ascending })
      .range(from, to)

    if (result.error?.code === RANGE_NOT_SATISFIABLE) {
      return buildPage([], await countMatching(sellerId, filters), page, limit)
    }
    if (result.error) throw new Error(`[sellerSales:list] ${result.error.message}`)

    const rows = (result.data ?? []) as Record<string, any>[]
    return buildPage(rows.map(toLine), result.count ?? rows.length, page, limit)
  },

  async counts(sellerId: string): Promise<SellerSalesCounts> {
    const entries = await Promise.all(
      SELLER_STATUSES.map(async (status) => [status, await countMatching(sellerId, { status })] as const),
    )
    const byStatus = Object.fromEntries(entries) as Record<(typeof SELLER_STATUSES)[number], number>
    const all = entries.reduce((sum, [, count]) => sum + count, 0)
    return { ALL: all, ...byStatus }
  },
}
