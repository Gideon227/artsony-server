import { URL } from 'url'
import { artworkRepository } from '../repositories/artwork.repository'
import { followRepository } from '@/modules/follow/repositories/follow.repository'
import { redisGetJson, redisSetJson, redisDel, getRedis, RedisKeys, RedisTTL } from '@/modules/redis/redis.client'
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  AppError,
} from '@/common/errors'
import type {
  Artwork,
  CreateArtworkInput,
  UpdateArtworkInput,
  ArtworkFilters,
  PaginatedArtworks,
  ArtworkAsset,
  FeaturedArtwork,
} from '@/common/types/artwork.types'
import {
  ALLOWED_EXTERNAL_PROTOCOLS,
  ALLOWED_EXTERNAL_MIME_TYPES,
  BLOCKED_EXTERNAL_HOSTS,
} from '@/common/types/artwork.types'
import type { UserRole } from '@/common/types'

// ── Cache helpers ─────────────────────────────────────────────────────────────

function invalidateArtworkCache(id: string, slug?: string): void {
  void redisDel(RedisKeys.artworkById(id))
  if (slug) void redisDel(RedisKeys.artworkBySlug(slug))

  // Flush list caches by SCAN pattern to avoid blocking Redis with KEYS.
  const redis = getRedis()
  void (async () => {
    let cursor = '0'
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'artsony:artwork:list:*', 'COUNT', 100)
      cursor = next
      if (keys.length > 0) await redis.del(...keys)
    } while (cursor !== '0')
  })()
}

// ── SSRF Prevention ───────────────────────────────────────────────────────────

function validateExternalLinkAsset(asset: Omit<ArtworkAsset, 'id'>): void {
  let parsed: URL
  try {
    parsed = new URL(asset.original_url)
  } catch {
    throw new ValidationError('Validation failed', {
      assets: `Invalid URL: ${asset.original_url}`,
    })
  }

  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    throw new ValidationError('Validation failed', {
      assets: `External links must use HTTPS. Got: ${parsed.protocol}`,
    })
  }

  const hostname = parsed.hostname.toLowerCase()

  if (BLOCKED_EXTERNAL_HOSTS.has(hostname)) {
    throw new ValidationError('Validation failed', {
      assets: `External link hostname is not permitted: ${hostname}`,
    })
  }

  // Comprehensive IP range matching block (covers decimal, hex, and octal patterns)
  // Strips alternative tracking notations used to obfuscate loopbacks and IMDS
  const blockedPrefixes = [
    '10.', '172.16.', '172.17.', '172.18.', '172.19.',
    '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
    '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
    '172.30.', '172.31.',
    '192.168.', '169.254.', '127.', '0x', '00', 'localhost'
  ]
  
  if (blockedPrefixes.some(p => hostname.startsWith(p))) {
    throw new ValidationError('Validation failed', {
      assets: `External link resolves to a private or reserved address: ${hostname}`,
    })
  }

  if (!ALLOWED_EXTERNAL_MIME_TYPES.has(asset.mime_type)) {
    throw new ValidationError('Validation failed', {
      assets: `MIME type '${asset.mime_type}' is not permitted for external links.`,
    })
  }
}

// ── Conditional field validation ──────────────────────────────────────────────

function validateConditionalFields(input: CreateArtworkInput): void {
  if (input.listing_type === 'MARKETPLACE') {
    if (input.price === undefined || input.price === null) {
      throw new ValidationError('Validation failed', {
        price: 'price is required for MARKETPLACE listings',
      })
    }
    if (input.price < 0) {
      throw new ValidationError('Validation failed', {
        price: 'price must be a non-negative number',
      })
    }
  }

  if (input.artwork_format === 'PHYSICAL') {
    if (!input.physical_details) {
      throw new ValidationError('Validation failed', {
        physical_details: 'physical_details is required when artwork_format is PHYSICAL',
      })
    }
    const pd = input.physical_details
    if (pd.available_quantity < 0) {
      throw new ValidationError('Validation failed', {
        physical_details: 'available_quantity must be >= 0',
      })
    }
    if (pd.length <= 0 || pd.width <= 0 || pd.height <= 0) {
      throw new ValidationError('Validation failed', {
        physical_details: 'length, width, and height must be positive numbers',
      })
    }
  }

  if (input.has_variants) {
    if (!input.variants?.length) {
      throw new ValidationError('Validation failed', {
        variants: 'at least one variant is required when has_variants is true',
      })
    }
    for (const variant of input.variants) {
      if (!variant.options.length) {
        throw new ValidationError('Validation failed', {
          variants: `variant "${variant.name}" must have at least one option`,
        })
      }
    }
  }
}

// ── Service Handlers ──────────────────────────────────────────────────────────

export async function createArtwork(
  input: CreateArtworkInput,
  creatorId: string,
  requesterRole: UserRole,
): Promise<Artwork> {
  validateConditionalFields(input)

  if (input.listing_type === 'MARKETPLACE') {
    assertCanPublishMarketplace(requesterRole)
  }

  // Explicitly validate any EXTERNAL_LINK assets before touching the DB
  if (input.assets && Array.isArray(input.assets)) {
    for (const asset of input.assets) {
      if (asset.media_type === 'EXTERNAL_LINK') {
        validateExternalLinkAsset(asset)
      }
    }
  }

  const slug = await artworkRepository.generateSlug(input.title, creatorId)
  return artworkRepository.create(input, creatorId, slug)
}

export async function getArtworkById(
  id: string,
  requesterId?: string,
): Promise<Artwork> {
  // const cached = await redisGetJson<Artwork>(RedisKeys.artworkById(id))
  // if (cached) return cached

  // Cache only the unauthenticated shape — is_saved is per-user and must
  // never leak across requesters through a shared cache key.
  if (!requesterId) {
    const cached = await redisGetJson<Artwork>(RedisKeys.artworkById(id))
    if (cached) return cached
  }

  const artwork = await artworkRepository.findById(id, requesterId)
  if (!artwork) throw new NotFoundError('Artwork')

  enforceVisibilityRead(artwork, requesterId)

  if (!requesterId) {
    void redisSetJson(RedisKeys.artworkById(id), artwork, RedisTTL.artworkSingle)
  }  
  return artwork
}

export async function getArtworkBySlug(
  slug: string,
  requesterId?: string,
): Promise<Artwork> {
  const cached = await redisGetJson<Artwork>(RedisKeys.artworkBySlug(slug))
  if (cached) return cached

  const artwork = await artworkRepository.findBySlug(slug)
  if (!artwork) throw new NotFoundError('Artwork')

  enforceVisibilityRead(artwork, requesterId)

  void redisSetJson(RedisKeys.artworkBySlug(slug), artwork, RedisTTL.artworkSingle)
  return artwork
}

// ── Featured artworks (homepage hero) ─────────────────────────────────────────
//
// Selection blends two pools so the hero never reads as either "stale
// classics" or "whatever just got posted":
//   - "Proven performers": all-time, ranked by purchase_count then like_count.
//     Reserves at least PROVEN_MIN_SLOTS of the result.
//   - "Trending": artworks published within TRENDING_WINDOW_DAYS, ranked by a
//     recency-decayed engagement score so a 2-day-old artwork with strong
//     early traction can outrank a 25-day-old one with the same raw counts.
//
// There is no event-level view/like timestamp table yet, so "recently got
// popular" is approximated as (weighted engagement / sqrt(age)) over recently
// published work rather than true rate-of-change — documented here since it's
// the kind of interpretation call that's easy to forget later.
//
// When the site doesn't have enough qualifying artworks yet (new/empty DB),
// this returns fewer than `limit` items — callers (frontend) pad the
// remainder with placeholder slides rather than erroring or leaving gaps.

const FEATURED_PROVEN_MIN_SLOTS = 2
const FEATURED_TRENDING_WINDOW_DAYS = 30
const FEATURED_TRENDING_CANDIDATE_POOL = 30
const FEATURED_WEIGHTS = { view: 1, like: 3, purchase: 8 }

function trendingScore(artwork: FeaturedArtwork): number {
  const ageDays = Math.max(
    1,
    (Date.now() - artwork.created_at.getTime()) / (1000 * 60 * 60 * 24),
  )
  const raw =
    artwork.view_count * FEATURED_WEIGHTS.view +
    artwork.like_count * FEATURED_WEIGHTS.like +
    artwork.purchase_count * FEATURED_WEIGHTS.purchase
  return raw / Math.sqrt(ageDays)
}

function takeUnpicked(
  pool: FeaturedArtwork[],
  pickedIds: Set<string>,
  count: number,
): FeaturedArtwork[] {
  const taken: FeaturedArtwork[] = []
  for (const artwork of pool) {
    if (taken.length >= count) break
    if (pickedIds.has(artwork.id)) continue
    taken.push(artwork)
    pickedIds.add(artwork.id)
  }
  return taken
}

export async function getFeaturedArtworks(limit = 5): Promise<FeaturedArtwork[]> {
  const cached = await redisGetJson<FeaturedArtwork[]>(RedisKeys.artworkFeatured(limit))
  if (cached) return cached

  const provenPoolSize = Math.max(limit, FEATURED_PROVEN_MIN_SLOTS * 3)
  const proven = await artworkRepository.findTopPerformers(provenPoolSize)

  const sinceIso = new Date(
    Date.now() - FEATURED_TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
  const trendingCandidates = await artworkRepository.findRecentCandidates(
    sinceIso,
    FEATURED_TRENDING_CANDIDATE_POOL,
  )
  const trending = [...trendingCandidates].sort(
    (a, b) => trendingScore(b) - trendingScore(a),
  )

  const pickedIds = new Set<string>()
  const selected: FeaturedArtwork[] = []

  selected.push(...takeUnpicked(proven, pickedIds, FEATURED_PROVEN_MIN_SLOTS))
  selected.push(...takeUnpicked(trending, pickedIds, limit - selected.length))
  // Backfill order: remaining proven-pool overflow, then remaining trending
  // overflow, then a general published/public pool as the last resort.
  selected.push(...takeUnpicked(proven, pickedIds, limit - selected.length))
  selected.push(...takeUnpicked(trending, pickedIds, limit - selected.length))

  if (selected.length < limit) {
    const fallback = await artworkRepository.findFallback(
      [...pickedIds],
      limit - selected.length,
    )
    selected.push(...fallback)
  }

  void redisSetJson(RedisKeys.artworkFeatured(limit), selected, RedisTTL.artworkFeatured)
  return selected
}

export async function getSizeLabels(): Promise<{ label: string; artwork_count: number }[]> {
  const cached = await redisGetJson<{ label: string; artwork_count: number }[]>(RedisKeys.sizeLabels())
  if (cached) return cached

  const result = await artworkRepository.getDistinctSizeLabels()

  void redisSetJson(RedisKeys.sizeLabels(), result, RedisTTL.artworkFeed)
  return result
}

export async function getTopPicks(
  limit = 8,
  period: 'all' | 'week' = 'all',
  listingType?: 'MARKETPLACE' | 'PORTFOLIO',
): Promise<Artwork[]> {
  const cacheKey = RedisKeys.topPicks(limit, period, listingType)
  const cached = await redisGetJson<Artwork[]>(cacheKey)
  if (cached) return cached

  if (period === 'all') {
    const result = await artworkRepository.getTopPicks(limit, listingType)
    void redisSetJson(cacheKey, result, RedisTTL.artworkFeed)
    return result
  }

  // "Trending this week" — reuses the same recency-decayed trendingScore()
  // used by the featured-artworks hero, restricted to a 7-day window.
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const candidates = await artworkRepository.findRecentCandidates(sinceIso, 60, listingType)
  const ranked = [...candidates].sort((a, b) => trendingScore(b) - trendingScore(a))
  const ids = ranked.slice(0, limit).map((c) => c.id)
  const result = await artworkRepository.findManyByIdsOrdered(ids)

  void redisSetJson(cacheKey, result, RedisTTL.artworkFeed)
  return result
}

export async function getLocations(): Promise<{ label: string; artwork_count: number }[]> {
  const cached = await redisGetJson<{ label: string; artwork_count: number }[]>(RedisKeys.locations())
  if (cached) return cached

  const result = await artworkRepository.getDistinctLocations()
  void redisSetJson(RedisKeys.locations(), result, RedisTTL.artworkFeed)
  return result
}

export async function listArtworks(
  filters: ArtworkFilters,
  requesterId?: string,
  requesterRole?: UserRole,
): Promise<PaginatedArtworks> {
  const effectiveFilters: ArtworkFilters = { ...filters }

  const isModerator = requesterRole === 'MODERATOR' || requesterRole === 'ADMIN'
  const isOwner     = filters.creator_id === requesterId

  if (!isModerator && !isOwner) {
    effectiveFilters.visibility = 'PUBLIC'
    effectiveFilters.status     = 'PUBLISHED'
  }

  const cacheFingerprint = JSON.stringify(effectiveFilters)
  const cached = await redisGetJson<PaginatedArtworks>(RedisKeys.artworkList(cacheFingerprint))
  if (cached) return cached

  const result = await artworkRepository.list(effectiveFilters)

  void redisSetJson(RedisKeys.artworkList(cacheFingerprint), result, RedisTTL.artworkFeed)
  return result
}

export type FeedMode = 'for_you' | 'following' | 'new' | 'trending' | 'newbies'

// Each mode is a genuinely different query, not just a sort order — 'new'
// and 'trending' reuse the plain listArtworks() path since they really are
// just a sort. 'following', 'for_you' and 'newbies' need their own signal
// gathered first (who you follow / what you've engaged with / who's new),
// then that signal is fed into the same listArtworks() filter machinery.
export async function getFeed(
  mode: FeedMode,
  filters: ArtworkFilters,
  requesterId?: string,
): Promise<PaginatedArtworks> {
  const base: ArtworkFilters = {
    ...filters,
    visibility: 'PUBLIC',
    status:     'PUBLISHED',
  }

  switch (mode) {
    case 'new':
      return artworkRepository.list({ ...base, sort_by: 'created_at', sort_order: 'desc' })

    case 'trending':
      return artworkRepository.list({ ...base, sort_by: 'like_count', sort_order: 'desc' })

    case 'following': {
      if (!requesterId) return emptyFeed(base)
      const followedIds = await followRepository.getFollowedIds(requesterId)
      if (followedIds.length === 0) return emptyFeed(base)
      return artworkRepository.list({ ...base, creator_ids: followedIds, sort_by: 'created_at', sort_order: 'desc' })
    }

    case 'newbies': {
      const recentArtistIds = await artworkRepository.getRecentArtistIds()
      if (recentArtistIds.length === 0) return emptyFeed(base)
      return artworkRepository.list({ ...base, creator_ids: recentArtistIds, sort_by: 'created_at', sort_order: 'desc' })
    }

    case 'for_you': {
      // No recommendation engine exists yet — this is a v1 heuristic:
      // category affinity from what the requester has liked, commented on,
      // or rated 5 stars. A brand-new user with no signal yet just gets the
      // default trending order rather than an empty feed.
      if (!requesterId) return artworkRepository.list({ ...base, sort_by: 'like_count', sort_order: 'desc' })

      const categories = await artworkRepository.getEngagedCategories(requesterId)
      if (categories.length === 0) {
        return artworkRepository.list({ ...base, sort_by: 'like_count', sort_order: 'desc' })
      }
      return artworkRepository.list({ ...base, categories, sort_by: 'created_at', sort_order: 'desc' })
    }
  }
}

function emptyFeed(filters: ArtworkFilters): PaginatedArtworks {
  const page  = filters.page ?? 1
  const limit = filters.limit ?? 20
  return { data: [], total: 0, page, limit, total_pages: 0, has_next: false, has_prev: page > 1 }
}

export async function updateArtwork(
  id: string,
  input: UpdateArtworkInput,
  requesterId: string,
  requesterRole: UserRole,
): Promise<Artwork> {
  const artwork = await artworkRepository.findById(id)
  if (!artwork) throw new NotFoundError('Artwork')

  enforceOwnershipOrModerator(artwork, requesterId, requesterRole)

  if (input.assets && Array.isArray(input.assets)) {
    for (const asset of input.assets) {
      if (asset.media_type === 'EXTERNAL_LINK') {
        validateExternalLinkAsset(asset as Omit<ArtworkAsset, 'id'>)
      }
    }
  }

  if (artwork.status === 'ARCHIVED') {
    throw new AppError('Archived artworks cannot be edited', 409, 'ARTWORK_ARCHIVED')
  }
  if (artwork.status === 'UNDER_REVIEW' && requesterRole !== 'MODERATOR' && requesterRole !== 'ADMIN') {
    throw new AppError('Artworks under review cannot be edited', 409, 'ARTWORK_UNDER_REVIEW')
  }

  // Changing price or variants on a MARKETPLACE artwork that has in-flight orders
  // risks breaking the order experience for buyers who are mid-checkout.
  // Block these specific field mutations until all active orders clear.
  const isPriceOrVariantChange =
    input.price !== undefined ||
    input.variants !== undefined ||
    input.has_variants !== undefined

  if (artwork.listing_type === 'MARKETPLACE' && isPriceOrVariantChange) {
    const blocked = await artworkRepository.hasActiveOrders(id)
    if (blocked) {
      throw new AppError(
        'Price and variant changes are not allowed while this artwork has active orders',
        409,
        'ARTWORK_HAS_ACTIVE_ORDERS',
      )
    }
  }

  const updated = await artworkRepository.update(id, input)
  invalidateArtworkCache(id, artwork.slug)
  return updated
}

export async function publishArtwork(
  id: string,
  requesterId: string,
  requesterRole: UserRole,
): Promise<Artwork> {
  const artwork = await artworkRepository.findById(id)
  if (!artwork) throw new NotFoundError('Artwork')

  enforceOwnershipOrModerator(artwork, requesterId, requesterRole)

  if (artwork.status === 'ARCHIVED') {
    throw new AppError('Archived artworks cannot be published', 409, 'ARTWORK_ARCHIVED')
  }
  if (!artwork.assets.length) {
    throw new ValidationError('Validation failed', {
      assets: 'An artwork must have at least one asset before publishing',
    })
  }

  if (artwork.listing_type === 'MARKETPLACE') {
    assertCanPublishMarketplace(requesterRole)

    if (artwork.price === null || artwork.price === undefined || artwork.price <= 0) {
      throw new ValidationError('Validation failed', {
        price: 'A valid price greater than 0 is required to publish a MARKETPLACE listing',
      })
    }
    if (!artwork.currency) {
      throw new ValidationError('Validation failed', {
        currency: 'A currency is required to publish a MARKETPLACE listing',
      })
    }
    if (artwork.artwork_format === 'PHYSICAL' && !artwork.physical_details) {
      throw new ValidationError('Validation failed', {
        physical_details: 'Physical details are required to publish a physical MARKETPLACE listing',
      })
    }
    if (artwork.has_variants && !artwork.variants.length) {
      throw new ValidationError('Validation failed', {
        variants: 'At least one variant is required when has_variants is true',
      })
    }
  }

  const updated = await artworkRepository.updateStatus(id, 'PUBLISHED', 'APPROVED')
  invalidateArtworkCache(id, artwork.slug)
  return updated
}

export async function archiveArtwork(
  id: string,
  requesterId: string,
  requesterRole: UserRole,
): Promise<Artwork> {
  const artwork = await artworkRepository.findById(id)
  if (!artwork) throw new NotFoundError('Artwork')

  enforceOwnershipOrModerator(artwork, requesterId, requesterRole)

  if (artwork.listing_type === 'MARKETPLACE') {
    const blocked = await artworkRepository.hasActiveOrders(id)
    if (blocked) {
      throw new AppError(
        'This artwork has active orders and cannot be archived until they are completed or cancelled',
        409,
        'ARTWORK_HAS_ACTIVE_ORDERS',
      )
    }
  }

  const updated = await artworkRepository.updateStatus(id, 'ARCHIVED')
  invalidateArtworkCache(id, artwork.slug)
  return updated
}

export async function deleteArtwork(
  id: string,
  requesterId: string,
  requesterRole: UserRole,
): Promise<void> {
  const artwork = await artworkRepository.findById(id)
  if (!artwork) throw new NotFoundError('Artwork')

  enforceOwnershipOrModerator(artwork, requesterId, requesterRole)

  if (artwork.listing_type === 'MARKETPLACE') {
    const blocked = await artworkRepository.hasActiveOrders(id)
    if (blocked) {
      throw new AppError(
        'This artwork has active orders and cannot be deleted until they are completed or cancelled',
        409,
        'ARTWORK_HAS_ACTIVE_ORDERS',
      )
    }
  }

  await artworkRepository.softDelete(id)
  invalidateArtworkCache(id, artwork.slug)
}

export async function flagArtwork(
  id: string,
  reviewerId: string,
  notes: string,
  moderationStatus: Artwork['moderation_status'],
): Promise<Artwork> {
  const artwork = await artworkRepository.findById(id)
  if (!artwork) throw new NotFoundError('Artwork')

  const updated = await artworkRepository.flag(id, reviewerId, notes, moderationStatus)
  invalidateArtworkCache(id, artwork.slug)
  return updated
}

export async function trackView(
  artworkId: string,
  identity: string,
): Promise<void> {
  const key    = RedisKeys.artworkViewLock(artworkId, identity)
  const cached = await redisGetJson<string>(key)
  if (cached) return

  await redisSetJson(key, '1', RedisTTL.artworkViewCooldown)
  await artworkRepository.incrementViewCount(artworkId)
  void redisDel(RedisKeys.artworkById(artworkId))
}

export async function toggleLike(
  artworkId: string,
  userId: string,
): Promise<{ liked: boolean; like_count: number }> {
  const artwork = await artworkRepository.findById(artworkId)
  if (!artwork) throw new NotFoundError('Artwork')
  if (artwork.status !== 'PUBLISHED') {
    throw new ForbiddenError('This artwork is not published yet')
  }
  if (!artwork.allow_likes) {
    throw new ForbiddenError('The creator has disabled likes on this artwork')
  }

  const result = await artworkRepository.toggleLike(artworkId, userId)
  void redisDel(RedisKeys.artworkById(artworkId))
  if (artwork.slug) void redisDel(RedisKeys.artworkBySlug(artwork.slug))
  return result
}

// ── Access Control Helpers ────────────────────────────────────────────────────

function enforceVisibilityRead(artwork: Artwork, requesterId?: string): void {
  if (artwork.visibility === 'PUBLIC' && artwork.status === 'PUBLISHED') return

  if (requesterId && artwork.creator_id === requesterId) return
  if (requesterId && artwork.collaborator_ids.includes(requesterId)) return

  if (artwork.visibility === 'PRIVATE') {
    throw new ForbiddenError('This artwork is private')
  }
  throw new NotFoundError('Artwork')
}

function enforceOwnershipOrModerator(
  artwork: Artwork,
  requesterId: string,
  requesterRole: UserRole,
): void {
  const isModerator = requesterRole === 'MODERATOR' || requesterRole === 'ADMIN'
  if (isModerator) return

  if (artwork.creator_id !== requesterId) {
    throw new ForbiddenError('You do not own this artwork')
  }
}

// Seller Registration integration point. role === 'ARTIST' is set/unset by
// transition_seller_registration() when an admin approves/suspends a seller
// (see 20240701000000_seller_registration_schema.sql) — checking the role
// claim directly means this guard costs zero extra DB/Redis lookups on the
// artwork create/publish hot path. ADMIN bypasses (consistent with
// enforceOwnershipOrModerator); MODERATOR does not — moderating content is a
// different privilege from being a commercial seller.
function assertCanPublishMarketplace(requesterRole: UserRole): void {
  if (requesterRole === 'ARTIST' || requesterRole === 'ADMIN') return
  throw new AppError(
    'Only approved sellers can create or publish MARKETPLACE listings',
    403,
    'SELLER_NOT_APPROVED',
  )
}

// ── Purchasability Guard ──────────────────────────────────────────────────────
// Single source of truth for the "can this artwork be purchased right now"
// predicate. Called by this service before archive/delete, and exported for
// the cart and checkout services to call directly.
//
// Throws a domain-specific AppError so callers never need to re-implement
// the check or inspect raw artwork fields.

export function enforceIsPurchasable(artwork: Artwork): void {
  if (artwork.listing_type !== 'MARKETPLACE') {
    throw new AppError(
      'This artwork is not listed for sale',
      422,
      'ARTWORK_NOT_FOR_SALE',
    )
  }
  if (artwork.status !== 'PUBLISHED') {
    throw new AppError(
      'This artwork is not available for purchase',
      422,
      'ARTWORK_NOT_PUBLISHED',
    )
  }
  if (artwork.moderation_status !== 'APPROVED') {
    throw new AppError(
      'This artwork has not been approved for sale',
      422,
      'ARTWORK_NOT_APPROVED',
    )
  }
  if (artwork.visibility !== 'PUBLIC') {
    throw new AppError(
      'This artwork is not publicly available',
      422,
      'ARTWORK_NOT_PUBLIC',
    )
  }
  if (artwork.is_flagged) {
    throw new AppError(
      'This artwork has been flagged and cannot be purchased',
      422,
      'ARTWORK_FLAGGED',
    )
  }
  if (artwork.price === null || artwork.price === undefined) {
    throw new AppError(
      'This artwork does not have a valid price',
      422,
      'ARTWORK_NO_PRICE',
    )
  }
}

// ── getPurchasableArtwork ─────────────────────────────────────────────────────
// Used by the cart and checkout services to fetch an artwork and guarantee
// it is currently purchasable in a single, cached operation.

export async function getPurchasableArtwork(id: string): Promise<Artwork> {
  const cached = await redisGetJson<Artwork>(RedisKeys.artworkById(id))
  if (cached) {
    enforceIsPurchasable(cached)
    return cached
  }

  const artwork = await artworkRepository.findPurchasableById(id)
  if (!artwork) {
    throw new AppError('Artwork is not available for purchase', 404, 'ARTWORK_NOT_PURCHASABLE')
  }

  void redisSetJson(RedisKeys.artworkById(id), artwork, RedisTTL.artworkSingle)
  return artwork
}

export async function toggleSave(
  artworkId: string,
  userId: string,
): Promise<{ saved: boolean; save_count: number }> {
  const artwork = await artworkRepository.findById(artworkId)
  if (!artwork) throw new NotFoundError('Artwork')
  if (artwork.status !== 'PUBLISHED') {
    throw new ForbiddenError('This artwork is not published yet')
  }
  if (!artwork.allow_moodboard_save) {
    throw new ForbiddenError('The creator has disabled saving on this artwork')
  }

  const result = await artworkRepository.toggleSave(artworkId, userId)
  void redisDel(RedisKeys.artworkById(artworkId))
  if (artwork.slug) void redisDel(RedisKeys.artworkBySlug(artwork.slug))
  return result
}

export async function reportArtwork(
  artworkId: string,
  reporterId: string,
  reason: string,
  notes?: string,
): Promise<void> {
  const artwork = await artworkRepository.findById(artworkId)
  if (!artwork) throw new NotFoundError('Artwork')

  await artworkRepository.createReport(artworkId, reporterId, reason, notes)
}