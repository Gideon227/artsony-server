import { supabase, assertNoError } from '@/config/database'
import type { OrderReview, OrderReviewWithContext, ReviewFilters, CreateReviewInput } from '@/common/types/review.types'
import type { PaginatedResult } from '@/common/types/commerce.types'

function toReview(row: any): OrderReview {
  return {
    id:                 row['id'],
    order_item_id:      row['order_item_id'],
    order_id:           row['order_id'],
    artwork_id:         row['artwork_id'],
    buyer_id:           row['buyer_id'],
    seller_id:          row['seller_id'],
    rating:             row['rating'],
    comment:            row['comment'] ?? null,
    condition_rating:   row['condition_rating'] ?? null,
    delivery_rating:    row['delivery_rating'] ?? null,
    created_at:         new Date(row['created_at']),
    updated_at:         new Date(row['updated_at']),
  }
}

export type ReviewEligibility = {
  order_item_id: string
  order_id: string
  buyer_id: string
  seller_id: string
  artwork_id: string
  artwork_title: string
  artwork_format: 'DIGITAL' | 'PHYSICAL'
  order_status: string
  physical_timeline_status: string | null
  already_reviewed: boolean
}

const ANONYMOUS_BUYER_NAME = 'Artsony buyer'

// users.username falls back to the signup email when none is supplied, so a
// username containing '@' is treated as private and never shown.
function publicBuyerName(profile: { display_name?: string | null } | null, username: string | null): string {
  const displayName = profile?.display_name?.trim()
  if (displayName) return displayName
  if (username && !username.includes('@')) return username
  return ANONYMOUS_BUYER_NAME
}

function firstProfile(value: any): { display_name?: string | null; avatar_url?: string | null } | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

export const reviewRepository = {
  // ── GetEligibility ─────────────────────────────────────────────────────────
  // Everything the service needs to decide whether the caller may review
  // this order item, in a single round trip.

  async getEligibility(orderItemId: string): Promise<ReviewEligibility | undefined> {
    const itemResult = await (supabase() as any)
      .from('order_items')
      .select('id, order_id, seller_id, artwork_id, artwork_title, artwork_format')
      .eq('id', orderItemId)
      .single()

    if (itemResult.error?.code === 'PGRST116') return undefined
    assertNoError(itemResult, 'review.getEligibility.item')
    const item = itemResult.data

    const orderResult = await (supabase() as any)
      .from('orders')
      .select('id, buyer_id, status')
      .eq('id', item['order_id'])
      .single()
    assertNoError(orderResult, 'review.getEligibility.order')
    const order = orderResult.data

    let physicalTimelineStatus: string | null = null
    if (item['artwork_format'] === 'PHYSICAL') {
      const physicalResult = await (supabase() as any)
        .from('order_item_physical')
        .select('timeline_status')
        .eq('order_item_id', orderItemId)
        .maybeSingle()
      physicalTimelineStatus = physicalResult.data?.['timeline_status'] ?? null
    }

    const existingResult = await (supabase() as any)
      .from('order_reviews')
      .select('id')
      .eq('order_item_id', orderItemId)
      .maybeSingle()

    return {
      order_item_id:              item['id'],
      order_id:                   item['order_id'],
      buyer_id:                   order['buyer_id'],
      seller_id:                  item['seller_id'],
      artwork_id:                 item['artwork_id'],
      artwork_title:              item['artwork_title'],
      artwork_format:             item['artwork_format'],
      order_status:               order['status'],
      physical_timeline_status:   physicalTimelineStatus,
      already_reviewed:           Boolean(existingResult.data),
    }
  },

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(input: CreateReviewInput & {
    order_id: string
    artwork_id: string
    buyer_id: string
    seller_id: string
  }): Promise<OrderReview> {
    const result = await (supabase() as any)
      .from('order_reviews')
      .insert({
        order_item_id:     input.order_item_id,
        order_id:           input.order_id,
        artwork_id:        input.artwork_id,
        buyer_id:          input.buyer_id,
        seller_id:         input.seller_id,
        rating:            input.rating,
        comment:           input.comment ?? null,
        condition_rating:  input.condition_rating ?? null,
        delivery_rating:   input.delivery_rating ?? null,
      })
      .select('*')
      .single()

    assertNoError(result, 'review.create')
    return toReview(result.data)
  },

  // ── List (seller-scoped "comment analytics", or artwork-scoped) ────────────

  async list(filters: ReviewFilters): Promise<PaginatedResult<OrderReviewWithContext>> {
    const page  = Math.max(1, filters.page ?? 1)
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20))
    const from  = (page - 1) * limit
    const to    = from + limit - 1

    let query = (supabase() as any)
      .from('order_reviews')
      .select(
        '*, order_items!inner(artwork_title), buyer:users!buyer_id(username, profile:profiles(display_name, avatar_url))',
        { count: 'exact' },
      )

    if (filters.seller_id)  query = query.eq('seller_id', filters.seller_id)
    if (filters.artwork_id) query = query.eq('artwork_id', filters.artwork_id)
    if (filters.date_from)  query = query.gte('created_at', filters.date_from)
    if (filters.date_to)    query = query.lte('created_at', filters.date_to)

    const ascending = filters.sort === 'oldest' || filters.sort === 'lowest'
    const orderCol  = (filters.sort === 'highest' || filters.sort === 'lowest') ? 'rating' : 'created_at'
    query = query.order(orderCol, { ascending }).range(from, to)

    const result = await query
    if (result.error) {
      throw new Error(`[Supabase:review.list] ${result.error.message}`)
    }

    const rows = ((result.data ?? []) as any[]).map((row) => {
      const profile = firstProfile(row['buyer']?.['profile'])
      return {
        row,
        buyer_name:       publicBuyerName(profile, row['buyer']?.['username'] ?? null),
        buyer_avatar_url: profile?.avatar_url ?? null,
      }
    })

    const needle = filters.search?.toLowerCase()
    const visible = needle
      ? rows.filter(({ row, buyer_name }) =>
          (row['comment'] ?? '').toLowerCase().includes(needle) ||
          buyer_name.toLowerCase().includes(needle) ||
          (row['order_items']?.['artwork_title'] ?? '').toLowerCase().includes(needle)
        )
      : rows

    const data: OrderReviewWithContext[] = visible.map(({ row, buyer_name, buyer_avatar_url }) => ({
      ...toReview(row),
      buyer_name,
      buyer_avatar_url,
      artwork_title: row['order_items']?.['artwork_title'] ?? 'Unknown artwork',
    }))

    const total       = filters.search ? data.length : (result.count ?? 0)
    const total_pages = Math.max(1, Math.ceil(total / limit))

    return {
      data,
      total,
      page,
      limit,
      total_pages,
      has_next: page < total_pages,
      has_prev: page > 1,
    }
  },

  // ── GetSellerAverageRatingBetween ──────────────────────────────────────────
  // Average star rating for reviews created in [start, end) — used to compare
  // two equally long windows for the Artsony Score's satisfaction trend.

  async getSellerAverageRatingBetween(
    sellerId: string,
    start: Date,
    end: Date,
  ): Promise<{ average_rating: number | null; review_count: number }> {
    const result = await (supabase() as any)
      .from('order_reviews')
      .select('rating')
      .eq('seller_id', sellerId)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())

    assertNoError(result, 'review.getSellerAverageRatingBetween')
    const ratings = ((result.data ?? []) as Array<{ rating: number }>).map((r) => r.rating)

    return {
      average_rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
      review_count:   ratings.length,
    }
  },

  // ── GetSellerRatingStats ───────────────────────────────────────────────────
  // Feeds the Artsony Score's buyer_satisfaction and order_reliability
  // sub-scores.

  async getSellerRatingStats(sellerId: string): Promise<{
    review_count: number
    average_rating: number | null
    average_condition_rating: number | null
    average_delivery_rating: number | null
  }> {
    const result = await (supabase() as any)
      .from('order_reviews')
      .select('rating, condition_rating, delivery_rating')
      .eq('seller_id', sellerId)

    assertNoError(result, 'review.getSellerRatingStats')
    const rows = (result.data ?? []) as Array<{
      rating: number
      condition_rating: number | null
      delivery_rating: number | null
    }>

    if (rows.length === 0) {
      return {
        review_count: 0,
        average_rating: null,
        average_condition_rating: null,
        average_delivery_rating: null,
      }
    }

    const avg = (values: number[]): number | null =>
      values.length ? values.reduce((a, b) => a + b, 0) / values.length : null

    return {
      review_count:               rows.length,
      average_rating:             avg(rows.map((r) => r.rating)),
      average_condition_rating:   avg(rows.map((r) => r.condition_rating).filter((v): v is number => v !== null)),
      average_delivery_rating:    avg(rows.map((r) => r.delivery_rating).filter((v): v is number => v !== null)),
    }
  },
}
