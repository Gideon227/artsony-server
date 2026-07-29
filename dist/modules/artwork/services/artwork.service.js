"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createArtwork = createArtwork;
exports.getArtworkById = getArtworkById;
exports.getArtworkBySlug = getArtworkBySlug;
exports.getFeaturedArtworks = getFeaturedArtworks;
exports.getSizeLabels = getSizeLabels;
exports.getTopPicks = getTopPicks;
exports.getLocations = getLocations;
exports.listArtworks = listArtworks;
exports.getFeed = getFeed;
exports.updateArtwork = updateArtwork;
exports.publishArtwork = publishArtwork;
exports.archiveArtwork = archiveArtwork;
exports.deleteArtwork = deleteArtwork;
exports.flagArtwork = flagArtwork;
exports.trackView = trackView;
exports.toggleLike = toggleLike;
exports.enforceIsPurchasable = enforceIsPurchasable;
exports.getPurchasableArtwork = getPurchasableArtwork;
exports.toggleSave = toggleSave;
exports.reportArtwork = reportArtwork;
const url_1 = require("url");
const artwork_repository_1 = require("../repositories/artwork.repository");
const follow_repository_1 = require("../../../modules/follow/repositories/follow.repository");
const redis_client_1 = require("../../../modules/redis/redis.client");
const errors_1 = require("../../../common/errors");
const artwork_types_1 = require("../../../common/types/artwork.types");
// ── Cache helpers ─────────────────────────────────────────────────────────────
function invalidateArtworkCache(id, slug) {
    void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.artworkById(id));
    if (slug)
        void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.artworkBySlug(slug));
    // Flush list caches by SCAN pattern to avoid blocking Redis with KEYS.
    const redis = (0, redis_client_1.getRedis)();
    void (async () => {
        let cursor = '0';
        do {
            const [next, keys] = await redis.scan(cursor, 'MATCH', 'artsony:artwork:list:*', 'COUNT', 100);
            cursor = next;
            if (keys.length > 0)
                await redis.del(...keys);
        } while (cursor !== '0');
    })();
}
// ── SSRF Prevention ───────────────────────────────────────────────────────────
function validateExternalLinkAsset(asset) {
    let parsed;
    try {
        parsed = new url_1.URL(asset.original_url);
    }
    catch {
        throw new errors_1.ValidationError('Validation failed', {
            assets: `Invalid URL: ${asset.original_url}`,
        });
    }
    if (!artwork_types_1.ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
        throw new errors_1.ValidationError('Validation failed', {
            assets: `External links must use HTTPS. Got: ${parsed.protocol}`,
        });
    }
    const hostname = parsed.hostname.toLowerCase();
    if (artwork_types_1.BLOCKED_EXTERNAL_HOSTS.has(hostname)) {
        throw new errors_1.ValidationError('Validation failed', {
            assets: `External link hostname is not permitted: ${hostname}`,
        });
    }
    // Comprehensive IP range matching block (covers decimal, hex, and octal patterns)
    // Strips alternative tracking notations used to obfuscate loopbacks and IMDS
    const blockedPrefixes = [
        '10.', '172.16.', '172.17.', '172.18.', '172.19.',
        '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
        '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
        '172.30.', '172.31.',
        '192.168.', '169.254.', '127.', '0x', '00', 'localhost'
    ];
    if (blockedPrefixes.some(p => hostname.startsWith(p))) {
        throw new errors_1.ValidationError('Validation failed', {
            assets: `External link resolves to a private or reserved address: ${hostname}`,
        });
    }
    if (!artwork_types_1.ALLOWED_EXTERNAL_MIME_TYPES.has(asset.mime_type)) {
        throw new errors_1.ValidationError('Validation failed', {
            assets: `MIME type '${asset.mime_type}' is not permitted for external links.`,
        });
    }
}
// ── Conditional field validation ──────────────────────────────────────────────
function validateConditionalFields(input) {
    if (input.listing_type === 'MARKETPLACE') {
        if (input.price === undefined || input.price === null) {
            throw new errors_1.ValidationError('Validation failed', {
                price: 'price is required for MARKETPLACE listings',
            });
        }
        if (input.price < 0) {
            throw new errors_1.ValidationError('Validation failed', {
                price: 'price must be a non-negative number',
            });
        }
    }
    if (input.artwork_format === 'PHYSICAL') {
        if (!input.physical_details) {
            throw new errors_1.ValidationError('Validation failed', {
                physical_details: 'physical_details is required when artwork_format is PHYSICAL',
            });
        }
        const pd = input.physical_details;
        if (pd.available_quantity < 0) {
            throw new errors_1.ValidationError('Validation failed', {
                physical_details: 'available_quantity must be >= 0',
            });
        }
        if (pd.length <= 0 || pd.width <= 0 || pd.height <= 0) {
            throw new errors_1.ValidationError('Validation failed', {
                physical_details: 'length, width, and height must be positive numbers',
            });
        }
    }
    if (input.has_variants) {
        if (!input.variants?.length) {
            throw new errors_1.ValidationError('Validation failed', {
                variants: 'at least one variant is required when has_variants is true',
            });
        }
        for (const variant of input.variants) {
            if (!variant.options.length) {
                throw new errors_1.ValidationError('Validation failed', {
                    variants: `variant "${variant.name}" must have at least one option`,
                });
            }
        }
    }
}
// ── Service Handlers ──────────────────────────────────────────────────────────
async function createArtwork(input, creatorId, requesterRole) {
    validateConditionalFields(input);
    if (input.listing_type === 'MARKETPLACE') {
        assertCanPublishMarketplace(requesterRole);
    }
    // Explicitly validate any EXTERNAL_LINK assets before touching the DB
    if (input.assets && Array.isArray(input.assets)) {
        for (const asset of input.assets) {
            if (asset.media_type === 'EXTERNAL_LINK') {
                validateExternalLinkAsset(asset);
            }
        }
    }
    const slug = await artwork_repository_1.artworkRepository.generateSlug(input.title, creatorId);
    return artwork_repository_1.artworkRepository.create(input, creatorId, slug);
}
async function getArtworkById(id, requesterId) {
    // const cached = await redisGetJson<Artwork>(RedisKeys.artworkById(id))
    // if (cached) return cached
    // Cache only the unauthenticated shape — is_saved is per-user and must
    // never leak across requesters through a shared cache key.
    if (!requesterId) {
        const cached = await (0, redis_client_1.redisGetJson)(redis_client_1.RedisKeys.artworkById(id));
        if (cached)
            return cached;
    }
    const artwork = await artwork_repository_1.artworkRepository.findById(id, requesterId);
    if (!artwork)
        throw new errors_1.NotFoundError('Artwork');
    enforceVisibilityRead(artwork, requesterId);
    if (!requesterId) {
        void (0, redis_client_1.redisSetJson)(redis_client_1.RedisKeys.artworkById(id), artwork, redis_client_1.RedisTTL.artworkSingle);
    }
    return artwork;
}
async function getArtworkBySlug(slug, requesterId) {
    const cached = await (0, redis_client_1.redisGetJson)(redis_client_1.RedisKeys.artworkBySlug(slug));
    if (cached)
        return cached;
    const artwork = await artwork_repository_1.artworkRepository.findBySlug(slug);
    if (!artwork)
        throw new errors_1.NotFoundError('Artwork');
    enforceVisibilityRead(artwork, requesterId);
    void (0, redis_client_1.redisSetJson)(redis_client_1.RedisKeys.artworkBySlug(slug), artwork, redis_client_1.RedisTTL.artworkSingle);
    return artwork;
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
const FEATURED_PROVEN_MIN_SLOTS = 2;
const FEATURED_TRENDING_WINDOW_DAYS = 30;
const FEATURED_TRENDING_CANDIDATE_POOL = 30;
const FEATURED_WEIGHTS = { view: 1, like: 3, purchase: 8 };
function trendingScore(artwork) {
    const ageDays = Math.max(1, (Date.now() - artwork.created_at.getTime()) / (1000 * 60 * 60 * 24));
    const raw = artwork.view_count * FEATURED_WEIGHTS.view +
        artwork.like_count * FEATURED_WEIGHTS.like +
        artwork.purchase_count * FEATURED_WEIGHTS.purchase;
    return raw / Math.sqrt(ageDays);
}
function takeUnpicked(pool, pickedIds, count) {
    const taken = [];
    for (const artwork of pool) {
        if (taken.length >= count)
            break;
        if (pickedIds.has(artwork.id))
            continue;
        taken.push(artwork);
        pickedIds.add(artwork.id);
    }
    return taken;
}
async function getFeaturedArtworks(limit = 5) {
    const cached = await (0, redis_client_1.redisGetJson)(redis_client_1.RedisKeys.artworkFeatured(limit));
    if (cached)
        return cached;
    const provenPoolSize = Math.max(limit, FEATURED_PROVEN_MIN_SLOTS * 3);
    const proven = await artwork_repository_1.artworkRepository.findTopPerformers(provenPoolSize);
    const sinceIso = new Date(Date.now() - FEATURED_TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const trendingCandidates = await artwork_repository_1.artworkRepository.findRecentCandidates(sinceIso, FEATURED_TRENDING_CANDIDATE_POOL);
    const trending = [...trendingCandidates].sort((a, b) => trendingScore(b) - trendingScore(a));
    const pickedIds = new Set();
    const selected = [];
    selected.push(...takeUnpicked(proven, pickedIds, FEATURED_PROVEN_MIN_SLOTS));
    selected.push(...takeUnpicked(trending, pickedIds, limit - selected.length));
    // Backfill order: remaining proven-pool overflow, then remaining trending
    // overflow, then a general published/public pool as the last resort.
    selected.push(...takeUnpicked(proven, pickedIds, limit - selected.length));
    selected.push(...takeUnpicked(trending, pickedIds, limit - selected.length));
    if (selected.length < limit) {
        const fallback = await artwork_repository_1.artworkRepository.findFallback([...pickedIds], limit - selected.length);
        selected.push(...fallback);
    }
    void (0, redis_client_1.redisSetJson)(redis_client_1.RedisKeys.artworkFeatured(limit), selected, redis_client_1.RedisTTL.artworkFeatured);
    return selected;
}
async function getSizeLabels() {
    const cached = await (0, redis_client_1.redisGetJson)(redis_client_1.RedisKeys.sizeLabels());
    if (cached)
        return cached;
    const result = await artwork_repository_1.artworkRepository.getDistinctSizeLabels();
    void (0, redis_client_1.redisSetJson)(redis_client_1.RedisKeys.sizeLabels(), result, redis_client_1.RedisTTL.artworkFeed);
    return result;
}
async function getTopPicks(limit = 8, period = 'all', listingType) {
    const cacheKey = redis_client_1.RedisKeys.topPicks(limit, period, listingType);
    const cached = await (0, redis_client_1.redisGetJson)(cacheKey);
    if (cached)
        return cached;
    if (period === 'all') {
        const result = await artwork_repository_1.artworkRepository.getTopPicks(limit, listingType);
        void (0, redis_client_1.redisSetJson)(cacheKey, result, redis_client_1.RedisTTL.artworkFeed);
        return result;
    }
    // "Trending this week" — reuses the same recency-decayed trendingScore()
    // used by the featured-artworks hero, restricted to a 7-day window.
    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const candidates = await artwork_repository_1.artworkRepository.findRecentCandidates(sinceIso, 60, listingType);
    const ranked = [...candidates].sort((a, b) => trendingScore(b) - trendingScore(a));
    const ids = ranked.slice(0, limit).map((c) => c.id);
    const result = await artwork_repository_1.artworkRepository.findManyByIdsOrdered(ids);
    void (0, redis_client_1.redisSetJson)(cacheKey, result, redis_client_1.RedisTTL.artworkFeed);
    return result;
}
async function getLocations() {
    const cached = await (0, redis_client_1.redisGetJson)(redis_client_1.RedisKeys.locations());
    if (cached)
        return cached;
    const result = await artwork_repository_1.artworkRepository.getDistinctLocations();
    void (0, redis_client_1.redisSetJson)(redis_client_1.RedisKeys.locations(), result, redis_client_1.RedisTTL.artworkFeed);
    return result;
}
async function listArtworks(filters, requesterId, requesterRole) {
    const effectiveFilters = { ...filters };
    const isModerator = requesterRole === 'MODERATOR' || requesterRole === 'ADMIN';
    const isOwner = filters.creator_id === requesterId;
    if (!isModerator && !isOwner) {
        effectiveFilters.visibility = 'PUBLIC';
        effectiveFilters.status = 'PUBLISHED';
    }
    const cacheFingerprint = JSON.stringify(effectiveFilters);
    const cached = await (0, redis_client_1.redisGetJson)(redis_client_1.RedisKeys.artworkList(cacheFingerprint));
    if (cached)
        return cached;
    const result = await artwork_repository_1.artworkRepository.list(effectiveFilters);
    void (0, redis_client_1.redisSetJson)(redis_client_1.RedisKeys.artworkList(cacheFingerprint), result, redis_client_1.RedisTTL.artworkFeed);
    return result;
}
// Each mode is a genuinely different query, not just a sort order — 'new'
// and 'trending' reuse the plain listArtworks() path since they really are
// just a sort. 'following', 'for_you' and 'newbies' need their own signal
// gathered first (who you follow / what you've engaged with / who's new),
// then that signal is fed into the same listArtworks() filter machinery.
async function getFeed(mode, filters, requesterId) {
    const base = {
        ...filters,
        visibility: 'PUBLIC',
        status: 'PUBLISHED',
    };
    switch (mode) {
        case 'new':
            return artwork_repository_1.artworkRepository.list({ ...base, sort_by: 'created_at', sort_order: 'desc' });
        case 'trending':
            return artwork_repository_1.artworkRepository.list({ ...base, sort_by: 'like_count', sort_order: 'desc' });
        case 'following': {
            if (!requesterId)
                return emptyFeed(base);
            const followedIds = await follow_repository_1.followRepository.getFollowedIds(requesterId);
            if (followedIds.length === 0)
                return emptyFeed(base);
            return artwork_repository_1.artworkRepository.list({ ...base, creator_ids: followedIds, sort_by: 'created_at', sort_order: 'desc' });
        }
        case 'newbies': {
            const recentArtistIds = await artwork_repository_1.artworkRepository.getRecentArtistIds();
            if (recentArtistIds.length === 0)
                return emptyFeed(base);
            return artwork_repository_1.artworkRepository.list({ ...base, creator_ids: recentArtistIds, sort_by: 'created_at', sort_order: 'desc' });
        }
        case 'for_you': {
            // No recommendation engine exists yet — this is a v1 heuristic:
            // category affinity from what the requester has liked, commented on,
            // or rated 5 stars. A brand-new user with no signal yet just gets the
            // default trending order rather than an empty feed.
            if (!requesterId)
                return artwork_repository_1.artworkRepository.list({ ...base, sort_by: 'like_count', sort_order: 'desc' });
            const categories = await artwork_repository_1.artworkRepository.getEngagedCategories(requesterId);
            if (categories.length === 0) {
                return artwork_repository_1.artworkRepository.list({ ...base, sort_by: 'like_count', sort_order: 'desc' });
            }
            return artwork_repository_1.artworkRepository.list({ ...base, categories, sort_by: 'created_at', sort_order: 'desc' });
        }
    }
}
function emptyFeed(filters) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    return { data: [], total: 0, page, limit, total_pages: 0, has_next: false, has_prev: page > 1 };
}
async function updateArtwork(id, input, requesterId, requesterRole) {
    const artwork = await artwork_repository_1.artworkRepository.findById(id);
    if (!artwork)
        throw new errors_1.NotFoundError('Artwork');
    enforceOwnershipOrModerator(artwork, requesterId, requesterRole);
    if (input.assets && Array.isArray(input.assets)) {
        for (const asset of input.assets) {
            if (asset.media_type === 'EXTERNAL_LINK') {
                validateExternalLinkAsset(asset);
            }
        }
    }
    if (artwork.status === 'ARCHIVED') {
        throw new errors_1.AppError('Archived artworks cannot be edited', 409, 'ARTWORK_ARCHIVED');
    }
    if (artwork.status === 'UNDER_REVIEW' && requesterRole !== 'MODERATOR' && requesterRole !== 'ADMIN') {
        throw new errors_1.AppError('Artworks under review cannot be edited', 409, 'ARTWORK_UNDER_REVIEW');
    }
    // Changing price or variants on a MARKETPLACE artwork that has in-flight orders
    // risks breaking the order experience for buyers who are mid-checkout.
    // Block these specific field mutations until all active orders clear.
    const isPriceOrVariantChange = input.price !== undefined ||
        input.variants !== undefined ||
        input.has_variants !== undefined;
    if (artwork.listing_type === 'MARKETPLACE' && isPriceOrVariantChange) {
        const blocked = await artwork_repository_1.artworkRepository.hasActiveOrders(id);
        if (blocked) {
            throw new errors_1.AppError('Price and variant changes are not allowed while this artwork has active orders', 409, 'ARTWORK_HAS_ACTIVE_ORDERS');
        }
    }
    const updated = await artwork_repository_1.artworkRepository.update(id, input);
    invalidateArtworkCache(id, artwork.slug);
    return updated;
}
async function publishArtwork(id, requesterId, requesterRole) {
    const artwork = await artwork_repository_1.artworkRepository.findById(id);
    if (!artwork)
        throw new errors_1.NotFoundError('Artwork');
    enforceOwnershipOrModerator(artwork, requesterId, requesterRole);
    if (artwork.status === 'ARCHIVED') {
        throw new errors_1.AppError('Archived artworks cannot be published', 409, 'ARTWORK_ARCHIVED');
    }
    if (!artwork.assets.length) {
        throw new errors_1.ValidationError('Validation failed', {
            assets: 'An artwork must have at least one asset before publishing',
        });
    }
    if (artwork.listing_type === 'MARKETPLACE') {
        assertCanPublishMarketplace(requesterRole);
        if (artwork.price === null || artwork.price === undefined || artwork.price <= 0) {
            throw new errors_1.ValidationError('Validation failed', {
                price: 'A valid price greater than 0 is required to publish a MARKETPLACE listing',
            });
        }
        if (!artwork.currency) {
            throw new errors_1.ValidationError('Validation failed', {
                currency: 'A currency is required to publish a MARKETPLACE listing',
            });
        }
        if (artwork.artwork_format === 'PHYSICAL' && !artwork.physical_details) {
            throw new errors_1.ValidationError('Validation failed', {
                physical_details: 'Physical details are required to publish a physical MARKETPLACE listing',
            });
        }
        if (artwork.has_variants && !artwork.variants.length) {
            throw new errors_1.ValidationError('Validation failed', {
                variants: 'At least one variant is required when has_variants is true',
            });
        }
    }
    const updated = await artwork_repository_1.artworkRepository.updateStatus(id, 'PUBLISHED', 'APPROVED');
    invalidateArtworkCache(id, artwork.slug);
    return updated;
}
async function archiveArtwork(id, requesterId, requesterRole) {
    const artwork = await artwork_repository_1.artworkRepository.findById(id);
    if (!artwork)
        throw new errors_1.NotFoundError('Artwork');
    enforceOwnershipOrModerator(artwork, requesterId, requesterRole);
    if (artwork.listing_type === 'MARKETPLACE') {
        const blocked = await artwork_repository_1.artworkRepository.hasActiveOrders(id);
        if (blocked) {
            throw new errors_1.AppError('This artwork has active orders and cannot be archived until they are completed or cancelled', 409, 'ARTWORK_HAS_ACTIVE_ORDERS');
        }
    }
    const updated = await artwork_repository_1.artworkRepository.updateStatus(id, 'ARCHIVED');
    invalidateArtworkCache(id, artwork.slug);
    return updated;
}
async function deleteArtwork(id, requesterId, requesterRole) {
    const artwork = await artwork_repository_1.artworkRepository.findById(id);
    if (!artwork)
        throw new errors_1.NotFoundError('Artwork');
    enforceOwnershipOrModerator(artwork, requesterId, requesterRole);
    if (artwork.listing_type === 'MARKETPLACE') {
        const blocked = await artwork_repository_1.artworkRepository.hasActiveOrders(id);
        if (blocked) {
            throw new errors_1.AppError('This artwork has active orders and cannot be deleted until they are completed or cancelled', 409, 'ARTWORK_HAS_ACTIVE_ORDERS');
        }
    }
    await artwork_repository_1.artworkRepository.softDelete(id);
    invalidateArtworkCache(id, artwork.slug);
}
async function flagArtwork(id, reviewerId, notes, moderationStatus) {
    const artwork = await artwork_repository_1.artworkRepository.findById(id);
    if (!artwork)
        throw new errors_1.NotFoundError('Artwork');
    const updated = await artwork_repository_1.artworkRepository.flag(id, reviewerId, notes, moderationStatus);
    invalidateArtworkCache(id, artwork.slug);
    return updated;
}
async function trackView(artworkId, identity) {
    const key = redis_client_1.RedisKeys.artworkViewLock(artworkId, identity);
    const cached = await (0, redis_client_1.redisGetJson)(key);
    if (cached)
        return;
    await (0, redis_client_1.redisSetJson)(key, '1', redis_client_1.RedisTTL.artworkViewCooldown);
    await artwork_repository_1.artworkRepository.incrementViewCount(artworkId);
    void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.artworkById(artworkId));
}
async function toggleLike(artworkId, userId) {
    const artwork = await artwork_repository_1.artworkRepository.findById(artworkId);
    if (!artwork)
        throw new errors_1.NotFoundError('Artwork');
    if (artwork.status !== 'PUBLISHED') {
        throw new errors_1.ForbiddenError('This artwork is not published yet');
    }
    if (!artwork.allow_likes) {
        throw new errors_1.ForbiddenError('The creator has disabled likes on this artwork');
    }
    const result = await artwork_repository_1.artworkRepository.toggleLike(artworkId, userId);
    void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.artworkById(artworkId));
    if (artwork.slug)
        void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.artworkBySlug(artwork.slug));
    return result;
}
// ── Access Control Helpers ────────────────────────────────────────────────────
function enforceVisibilityRead(artwork, requesterId) {
    if (artwork.visibility === 'PUBLIC' && artwork.status === 'PUBLISHED')
        return;
    if (requesterId && artwork.creator_id === requesterId)
        return;
    if (requesterId && artwork.collaborator_ids.includes(requesterId))
        return;
    if (artwork.visibility === 'PRIVATE') {
        throw new errors_1.ForbiddenError('This artwork is private');
    }
    throw new errors_1.NotFoundError('Artwork');
}
function enforceOwnershipOrModerator(artwork, requesterId, requesterRole) {
    const isModerator = requesterRole === 'MODERATOR' || requesterRole === 'ADMIN';
    if (isModerator)
        return;
    if (artwork.creator_id !== requesterId) {
        throw new errors_1.ForbiddenError('You do not own this artwork');
    }
}
// Seller Registration integration point. role === 'ARTIST' is set/unset by
// transition_seller_registration() when an admin approves/suspends a seller
// (see 20240701000000_seller_registration_schema.sql) — checking the role
// claim directly means this guard costs zero extra DB/Redis lookups on the
// artwork create/publish hot path. ADMIN bypasses (consistent with
// enforceOwnershipOrModerator); MODERATOR does not — moderating content is a
// different privilege from being a commercial seller.
function assertCanPublishMarketplace(requesterRole) {
    if (requesterRole === 'ARTIST' || requesterRole === 'ADMIN')
        return;
    throw new errors_1.AppError('Only approved sellers can create or publish MARKETPLACE listings', 403, 'SELLER_NOT_APPROVED');
}
// ── Purchasability Guard ──────────────────────────────────────────────────────
// Single source of truth for the "can this artwork be purchased right now"
// predicate. Called by this service before archive/delete, and exported for
// the cart and checkout services to call directly.
//
// Throws a domain-specific AppError so callers never need to re-implement
// the check or inspect raw artwork fields.
function enforceIsPurchasable(artwork) {
    if (artwork.listing_type !== 'MARKETPLACE') {
        throw new errors_1.AppError('This artwork is not listed for sale', 422, 'ARTWORK_NOT_FOR_SALE');
    }
    if (artwork.status !== 'PUBLISHED') {
        throw new errors_1.AppError('This artwork is not available for purchase', 422, 'ARTWORK_NOT_PUBLISHED');
    }
    if (artwork.moderation_status !== 'APPROVED') {
        throw new errors_1.AppError('This artwork has not been approved for sale', 422, 'ARTWORK_NOT_APPROVED');
    }
    if (artwork.visibility !== 'PUBLIC') {
        throw new errors_1.AppError('This artwork is not publicly available', 422, 'ARTWORK_NOT_PUBLIC');
    }
    if (artwork.is_flagged) {
        throw new errors_1.AppError('This artwork has been flagged and cannot be purchased', 422, 'ARTWORK_FLAGGED');
    }
    if (artwork.price === null || artwork.price === undefined) {
        throw new errors_1.AppError('This artwork does not have a valid price', 422, 'ARTWORK_NO_PRICE');
    }
}
// ── getPurchasableArtwork ─────────────────────────────────────────────────────
// Used by the cart and checkout services to fetch an artwork and guarantee
// it is currently purchasable in a single, cached operation.
async function getPurchasableArtwork(id) {
    const cached = await (0, redis_client_1.redisGetJson)(redis_client_1.RedisKeys.artworkById(id));
    if (cached) {
        enforceIsPurchasable(cached);
        return cached;
    }
    const artwork = await artwork_repository_1.artworkRepository.findPurchasableById(id);
    if (!artwork) {
        throw new errors_1.AppError('Artwork is not available for purchase', 404, 'ARTWORK_NOT_PURCHASABLE');
    }
    void (0, redis_client_1.redisSetJson)(redis_client_1.RedisKeys.artworkById(id), artwork, redis_client_1.RedisTTL.artworkSingle);
    return artwork;
}
async function toggleSave(artworkId, userId) {
    const artwork = await artwork_repository_1.artworkRepository.findById(artworkId);
    if (!artwork)
        throw new errors_1.NotFoundError('Artwork');
    if (artwork.status !== 'PUBLISHED') {
        throw new errors_1.ForbiddenError('This artwork is not published yet');
    }
    if (!artwork.allow_moodboard_save) {
        throw new errors_1.ForbiddenError('The creator has disabled saving on this artwork');
    }
    const result = await artwork_repository_1.artworkRepository.toggleSave(artworkId, userId);
    void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.artworkById(artworkId));
    if (artwork.slug)
        void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.artworkBySlug(artwork.slug));
    return result;
}
async function reportArtwork(artworkId, reporterId, reason, notes) {
    const artwork = await artwork_repository_1.artworkRepository.findById(artworkId);
    if (!artwork)
        throw new errors_1.NotFoundError('Artwork');
    await artwork_repository_1.artworkRepository.createReport(artworkId, reporterId, reason, notes);
}
//# sourceMappingURL=artwork.service.js.map