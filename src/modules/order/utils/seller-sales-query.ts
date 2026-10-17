import {
  SELLER_SALES_FORMATS,
  SELLER_STATUSES,
  type SellerSalesFilters,
  type SellerSalesFormat,
  type SellerStatus,
} from '../../../common/types/seller-sales.types'

export const SELLER_SALES_DEFAULT_LIMIT = 20
export const SELLER_SALES_MAX_LIMIT = 50
const MAX_SEARCH_TOKENS = 5
const MAX_TOKEN_LENGTH = 50

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export function searchTokens(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f*]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim().slice(0, MAX_TOKEN_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TOKENS)
}

export function pageRange(page: number, limit: number): { from: number; to: number } {
  const from = (page - 1) * limit
  return { from, to: from + limit - 1 }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  const raw = asString(value)
  if (raw === undefined) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseSellerSalesFilters(query: Record<string, unknown>): SellerSalesFilters {
  const status = asString(query['status'])
  const format = asString(query['format'])
  const priceMin = asNumber(query['price_min'])
  const priceMax = asNumber(query['price_max'])
  const dateFrom = asString(query['date_from'])
  const dateTo = asString(query['date_to'])
  const search = asString(query['q'])?.trim()
  const sortOrder = asString(query['sort_order'])
  const page = asNumber(query['page'])
  const limit = asNumber(query['limit'])

  return {
    ...(status && (SELLER_STATUSES as readonly string[]).includes(status) && { status: status as SellerStatus }),
    ...(format && (SELLER_SALES_FORMATS as readonly string[]).includes(format) && { format: format as SellerSalesFormat }),
    ...(priceMin !== undefined && { price_min: priceMin }),
    ...(priceMax !== undefined && { price_max: priceMax }),
    ...(dateFrom && { date_from: new Date(dateFrom).toISOString() }),
    ...(dateTo && { date_to: new Date(dateTo).toISOString() }),
    ...(search && { q: search }),
    sort_order: sortOrder === 'asc' ? 'asc' : 'desc',
    page: page ?? 1,
    limit: Math.min(limit ?? SELLER_SALES_DEFAULT_LIMIT, SELLER_SALES_MAX_LIMIT),
  }
}
