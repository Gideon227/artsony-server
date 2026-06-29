import Redis from 'ioredis'
import { config } from '@/config'

let instance: Redis | null = null

export function getRedis(): Redis {
  if (!instance) {
    instance = new Redis(config.redis.url, {
      keyPrefix: config.redis.keyPrefix,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    })
    instance.on('error', (err) => {
      console.error('[Redis] Connection error:', err)
    })
  }
  return instance
}

// ── TTL registry (single source of truth) ────────────────────────────────────
// All TTL values in seconds. Every module imports from here — no local
// magic numbers.

export const RedisTTL = {
  // Auth
  session: 60 * 60 * 24 * 30, // 30 days
  resetToken: 60 * 15,           // 15 min
  emailVerify: 60 * 60 * 24,      // 24 hours
  oauthState: 60 * 10,           // 10 min
  loginAttempts: 60 * 30,           // 30 min lockout window
  rtBlacklist: 60 * 60 * 24 * 30, // match refresh token lifetime

  // Artwork
  artworkSingle: 60 * 5,            // 5 min — individual artwork
  artworkFeed: 60 * 2,            // 2 min — paginated list
  artworkViewCooldown: 60 * 30,           // 30 min — deduplicate view counts

  // Cart
  cart: 60 * 10,           // 10 min — full cart with artwork data

  // Order
  orderSingle: 60 * 2,            // 2 min — single order detail
  orderIdempotency: 60 * 60 * 24,      // 24 hours — checkout replay protection

  // Payment
  paymentStatus: 60 * 2,            // 2 min — buyer polling payment state
  verifyLock: 30,                // 30 s  — blockchain verify distributed lock

  // Delivery
  deliveryToken: 60 * 5,            // 5 min — validated download token metadata

  // Idempotency middleware
  httpIdempotency: 60 * 60 * 24,      // 24 hours — HTTP-layer mutation replay

  // Messaging & Notifications
  msgIdempotency: 60 * 60 * 24,      // 24 hours — client-generated idempotency tracking
  wsRateLimit: 60,                // 1 min — WebSocket rate limit window
  convParticipants: 60 * 5,            // 5 min — participant array fallback cache
  userUnreadCount: 60 * 60 * 24,      // 24 hours — conversation unread counter cache
  userUnreadNotifs: 60 * 60 * 24,      // 24 hours — global notifications unread cache
} as const

export type RedisTTLKey = keyof typeof RedisTTL

// ── Key registry (single source of truth) ────────────────────────────────────
// Every cache key in the system is defined here. No module defines its own
// key strings — they all import from this registry.
// The keyPrefix 'artsony:' is applied by ioredis automatically, EXCEPT where noted.

export const RedisKeys = {
  // ── Auth ───────────────────────────────────────────────────────────────────
  session:        (sessionId: string)             => `auth:session:${sessionId}`,
  rtBlacklist:    (tokenHash: string)             => `auth:rt:blacklist:${tokenHash}`,
  loginAttempts:  (email: string)                 => `auth:attempts:login:${encodeURIComponent(email)}`,
  resetAttempts:  (email: string)                 => `auth:attempts:reset:${encodeURIComponent(email)}`,
  lockout:        (email: string)                 => `auth:lockout:${encodeURIComponent(email)}`,
  rateLimitIp:    (ip: string, route: string)     => `auth:ratelimit:ip:${ip}:${route}`,
  resetToken:     (userId: string)                => `auth:reset:${userId}`,
  emailVerify:    (userId: string)                => `auth:verify:${userId}`,
  oauthState:     (state: string)                 => `auth:oauth:state:${state}`,

  // ── Artwork ────────────────────────────────────────────────────────────────
  artworkById:    (id: string)                    => `artwork:single:${id}`,
  artworkBySlug:  (slug: string)                  => `artwork:slug:${slug}`,
  artworkList:    (fingerprint: string)           => `artwork:list:${fingerprint}`,
  artworkViewLock:(artworkId: string, id: string) => `artwork:view:${artworkId}:${id}`,

  // ── Cart ───────────────────────────────────────────────────────────────────
  cart:           (userId: string)                => `cart:${userId}`,

  // ── Order ──────────────────────────────────────────────────────────────────
  orderById:      (orderId: string)               => `order:single:${orderId}`,
  orderBuyerList: (buyerId: string, page: number) => `order:buyer:${buyerId}:page:${page}`,
  orderSellerList:(sellerId: string, page: number)=> `order:seller:${sellerId}:page:${page}`,
  orderIdempotent:(key: string)                   => `order:idem:${key}`,

  // ── Payment ────────────────────────────────────────────────────────────────
  paymentStatus:  (orderId: string)               => `payment:status:${orderId}`,
  verifyLock:     (txId: string)                  => `payment:verify:lock:${txId}`,

  // ── Delivery ───────────────────────────────────────────────────────────────
  deliveryToken:  (tokenHash: string)             => `delivery:token:${tokenHash}`,

  // ── Messaging — Presence ────────────────────────────────────────────────────
  // Stored WITHOUT relying on automatic keyPrefix configuration because pub/sub
  // channels use bare strings and the subscriber client has keyPrefix disabled.
  userPresence:  (userId: string)               => `artsony:presence:${userId}`,
  typingKey:      (convId: string, uid: string) => `artsony:typing:${convId}:${uid}`,

  // ── Messaging — Idempotency ─────────────────────────────────────────────────
  msgIdempotency: (clientMsgId: string)         => `artsony:msg:idem:${clientMsgId}`,

  // ── Messaging — WS Rate Limit ───────────────────────────────────────────────
  wsRateLimit:    (userId: string)              => `artsony:wsrl:${userId}`,

  // ── Messaging — Conversation cache ─────────────────────────────────────────
  convParticipants: (convId: string)            => `artsony:conv:${convId}:participants`,
  userUnreadCount:  (userId: string)            => `artsony:user:${userId}:unread`,

  // ── Notifications ───────────────────────────────────────────────────────────
  userUnreadNotifs: (userId: string)            => `artsony:notif:${userId}:unread`,

  // ── Idempotency middleware ─────────────────────────────────────────────────
  httpIdempotency:(userId: string, key: string)   => `idempotency:${userId}:${key}`,
} as const

// ── Generic typed helpers ─────────────────────────────────────────────────────

export async function redisSet(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  await getRedis().set(key, value, 'EX', ttlSeconds)
}

export async function redisGet(key: string): Promise<string | null> {
  return getRedis().get(key)
}

export async function redisDel(key: string): Promise<void> {
  await getRedis().del(key)
}

export async function redisIncr(key: string, ttlSeconds?: number): Promise<number> {
  const redis = getRedis()
  const count = await redis.incr(key)
  if (count === 1 && ttlSeconds) {
    await redis.expire(key, ttlSeconds)
  }
  return count
}

export async function redisTtl(key: string): Promise<number> {
  return getRedis().ttl(key)
}

// ── Pipeline helper ───────────────────────────────────────────────────────────
export function redisPipeline() {
  return getRedis().pipeline()
}

// ── JSON convenience helpers ───────────────────────────────────────────────────

export async function redisSetJson<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  await redisSet(key, JSON.stringify(value), ttlSeconds)
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const raw = await redisGet(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    // Corrupt cache entry — treat as miss
    void redisDel(key)
    return null
  }
}