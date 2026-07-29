"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisKeys = exports.RedisTTL = void 0;
exports.getRedis = getRedis;
exports.redisSet = redisSet;
exports.redisGet = redisGet;
exports.redisDel = redisDel;
exports.redisIncr = redisIncr;
exports.redisTtl = redisTtl;
exports.redisPipeline = redisPipeline;
exports.redisSetJson = redisSetJson;
exports.redisGetJson = redisGetJson;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../../config");
let instance = null;
function getRedis() {
    if (!instance) {
        instance = new ioredis_1.default(config_1.config.redis.url, {
            keyPrefix: config_1.config.redis.keyPrefix,
            maxRetriesPerRequest: null,
            enableReadyCheck: true,
            lazyConnect: false,
        });
        instance.on('error', (err) => {
            console.error('[Redis] Connection error:', err);
        });
    }
    return instance;
}
// ── TTL registry (single source of truth) ────────────────────────────────────
// All TTL values in seconds. Every module imports from here — no local
// magic numbers.
exports.RedisTTL = {
    // Auth
    session: 60 * 60 * 24 * 30, // 30 days
    resetToken: 60 * 15, // 15 min
    emailVerify: 60 * 60 * 24, // 24 hours
    oauthState: 60 * 10, // 10 min
    loginAttempts: 60 * 30, // 30 min lockout window
    rtBlacklist: 60 * 60 * 24 * 30, // match refresh token lifetime
    // Artwork
    artworkSingle: 60 * 5, // 5 min — individual artwork
    artworkFeed: 60 * 2, // 2 min — paginated list
    artworkViewCooldown: 60 * 30, // 30 min — deduplicate view counts
    artworkFeatured: 60 * 10, // 10 min — homepage hero carousel
    // Cart
    cart: 60 * 10, // 10 min — full cart with artwork data
    // Physical order
    orderCancelLock: 10, // 10s — prevent concurrent cancel race
    orderPhysicalView: 60 * 2, // 2 min — physical item view cache
    // Order
    orderSingle: 60 * 2, // 2 min — single order detail
    orderIdempotency: 60 * 60 * 24, // 24 hours — checkout replay protection
    // Payment
    paymentStatus: 60 * 2, // 2 min — buyer polling payment state
    verifyLock: 30, // 30 s  — blockchain verify distributed lock
    // Delivery
    deliveryToken: 60 * 5, // 5 min — validated download token metadata
    // Idempotency middleware
    httpIdempotency: 60 * 60 * 24, // 24 hours — HTTP-layer mutation replay
    // Messaging & Notifications
    msgIdempotency: 60 * 60 * 24, // 24 hours — client-generated idempotency tracking
    wsRateLimit: 60, // 1 min — WebSocket rate limit window
    convParticipants: 60 * 5, // 5 min — participant array fallback cache
    userUnreadCount: 60 * 60 * 24, // 24 hours — conversation unread counter cache
    userUnreadNotifs: 60 * 60 * 24, // 24 hours — global notifications unread cache
};
// ── Key registry (single source of truth) ────────────────────────────────────
// Every cache key in the system is defined here. No module defines its own
// key strings — they all import from this registry.
// The keyPrefix 'artsony:' is applied by ioredis automatically, EXCEPT where noted.
exports.RedisKeys = {
    // Auth  
    session: (sessionId) => `auth:session:${sessionId}`,
    rtBlacklist: (tokenHash) => `auth:rt:blacklist:${tokenHash}`,
    loginAttempts: (email) => `auth:attempts:login:${encodeURIComponent(email)}`,
    resetAttempts: (email) => `auth:attempts:reset:${encodeURIComponent(email)}`,
    lockout: (email) => `auth:lockout:${encodeURIComponent(email)}`,
    rateLimitIp: (ip, route) => `auth:ratelimit:ip:${ip}:${route}`,
    resetToken: (userId) => `auth:reset:${userId}`,
    emailVerify: (userId) => `auth:verify:${userId}`,
    oauthState: (state) => `auth:oauth:state:${state}`,
    // ── Artwork ────────────────────────────────────────────────────────────────
    artworkById: (id) => `artwork:single:${id}`,
    artworkBySlug: (slug) => `artwork:slug:${slug}`,
    artworkList: (fingerprint) => `artwork:list:${fingerprint}`,
    topPicks: (limit, period = 'all', listingType) => `artwork:top-picks:${period}:${limit}:${listingType ?? 'ALL'}`,
    locations: () => `artwork:locations`,
    sizeLabels: () => `artwork:size-labels`,
    artworkViewLock: (artworkId, id) => `artwork:view:${artworkId}:${id}`,
    artworkFeatured: (limit) => `artwork:featured:${limit}`,
    // ── Cart ───────────────────────────────────────────────────────────────────
    cart: (userId) => `cart:${userId}`,
    // ── Order ──────────────────────────────────────────────────────────────────
    orderById: (orderId) => `order:single:${orderId}`,
    orderBuyerList: (buyerId, page) => `order:buyer:${buyerId}:page:${page}`,
    orderSellerList: (sellerId, page) => `order:seller:${sellerId}:page:${page}`,
    orderIdempotent: (key) => `order:idem:${key}`,
    // ── Payment ────────────────────────────────────────────────────────────────
    paymentStatus: (orderId) => `payment:status:${orderId}`,
    verifyLock: (txId) => `payment:verify:lock:${txId}`,
    // ── Delivery ───────────────────────────────────────────────────────────────
    deliveryToken: (tokenHash) => `delivery:token:${tokenHash}`,
    // ── Messaging — Presence ────────────────────────────────────────────────────
    // Stored WITHOUT relying on automatic keyPrefix configuration because pub/sub
    // channels use bare strings and the subscriber client has keyPrefix disabled.
    userPresence: (userId) => `artsony:presence:${userId}`,
    typingKey: (convId, uid) => `artsony:typing:${convId}:${uid}`,
    // ── Messaging — Idempotency ─────────────────────────────────────────────────
    msgIdempotency: (clientMsgId) => `artsony:msg:idem:${clientMsgId}`,
    // ── Messaging — WS Rate Limit ───────────────────────────────────────────────
    wsRateLimit: (userId) => `artsony:wsrl:${userId}`,
    // ── Messaging — Conversation cache ─────────────────────────────────────────
    convParticipants: (convId) => `artsony:conv:${convId}:participants`,
    userUnreadCount: (userId) => `artsony:user:${userId}:unread`,
    // ── Notifications ───────────────────────────────────────────────────────────
    userUnreadNotifs: (userId) => `artsony:notif:${userId}:unread`,
    // ── Idempotency middleware ─────────────────────────────────────────────────
    httpIdempotency: (userId, key) => `idempotency:${userId}:${key}`,
    // ── Physical order pipeline ──────────────────────────────────────────────
    orderCancelLock: (physicalId) => `order:cancel:lock:${physicalId}`,
    physicalView: (physicalId) => `physical:view:${physicalId}`,
};
// ── Generic typed helpers ─────────────────────────────────────────────────────
async function redisSet(key, value, ttlSeconds) {
    await getRedis().set(key, value, 'EX', ttlSeconds);
}
async function redisGet(key) {
    return getRedis().get(key);
}
async function redisDel(key) {
    await getRedis().del(key);
}
async function redisIncr(key, ttlSeconds) {
    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1 && ttlSeconds) {
        await redis.expire(key, ttlSeconds);
    }
    return count;
}
async function redisTtl(key) {
    return getRedis().ttl(key);
}
// ── Pipeline helper ───────────────────────────────────────────────────────────
function redisPipeline() {
    return getRedis().pipeline();
}
// ── JSON convenience helpers ───────────────────────────────────────────────────
async function redisSetJson(key, value, ttlSeconds) {
    await redisSet(key, JSON.stringify(value), ttlSeconds);
}
async function redisGetJson(key) {
    const raw = await redisGet(key);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        // Corrupt cache entry — treat as miss
        void redisDel(key);
        return null;
    }
}
//# sourceMappingURL=redis.client.js.map