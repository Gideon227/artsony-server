import Redis from 'ioredis'
import { config } from '@/config'

let instance: Redis | null = null

export function getRedis(): Redis {
  if (!instance) {
    instance = new Redis(config.redis.url, {
      keyPrefix: config.redis.keyPrefix,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    })
    instance.on('error', (err) => {
      console.error('[Redis] Connection error:', err)
    })
  }
  return instance
}

// ─── Typed key builders (single source of truth for naming) ─────────────────

export const RedisKeys = {
  session:          (sessionId: string)   => `auth:session:${sessionId}`,
  rtBlacklist:      (tokenHash: string)   => `auth:rt:blacklist:${tokenHash}`,
  loginAttempts:    (email: string)       => `auth:attempts:login:${encodeURIComponent(email)}`,
  resetAttempts:    (email: string)       => `auth:attempts:reset:${encodeURIComponent(email)}`,
  lockout:          (email: string)       => `auth:lockout:${encodeURIComponent(email)}`,
  rateLimitIp:      (ip: string, route: string) => `auth:ratelimit:ip:${ip}:${route}`,
  resetToken:       (userId: string)      => `auth:reset:${userId}`,
  emailVerify:      (userId: string)      => `auth:verify:${userId}`,
  oauthState:       (state: string)       => `auth:oauth:state:${state}`,
} as const

// ─── Generic typed helpers ────────────────────────────────────────────────────

export async function redisSet(
  key: string,
  value: string,
  ttlSeconds: number
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
