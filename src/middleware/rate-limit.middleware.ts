import rateLimit from 'express-rate-limit'
import slowDown from 'express-slow-down'
import { getRedis } from '../modules/redis/redis.client'
import { config } from '../config'
import { TooManyRequestsError } from '../common/errors'
import type { Request, Response } from 'express'

// Custom Redis store for rate-limit — persists across restarts
class RedisStore {
  private prefix: string

  constructor(prefix: string) {
    this.prefix = prefix
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
    const redis = getRedis()
    const redisKey = `${this.prefix}${key}`
    const multi = redis.multi()
    multi.incr(redisKey)
    multi.ttl(redisKey)
    const results = await multi.exec()

    const hits = (results?.[0]?.[1] as number) ?? 1
    const ttl = (results?.[1]?.[1] as number) ?? -1

    if (hits === 1) {
      await redis.expire(redisKey, Math.ceil(config.security.rateLimits.auth.windowMs / 1000))
    }

    const resetTime = ttl > 0
      ? new Date(Date.now() + ttl * 1000)
      : new Date(Date.now() + config.security.rateLimits.auth.windowMs)

    return { totalHits: hits, resetTime }
  }

  async decrement(key: string): Promise<void> {
    await getRedis().decr(`${this.prefix}${key}`)
  }

  async resetKey(key: string): Promise<void> {
    await getRedis().del(`${this.prefix}${key}`)
  }
}

const handler = (_req: Request, _res: Response): void => {
  throw new TooManyRequestsError()
}

// ─── Auth routes: 10 requests per 15 minutes ─────────────────────────────────

export const authRateLimit = rateLimit({
  windowMs: config.security.rateLimits.auth.windowMs,
  max: config.security.rateLimits.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler,
  store: new RedisStore('rl:auth:') as never,
})

// ─── Password reset: 3 requests per hour ─────────────────────────────────────

export const resetRateLimit = rateLimit({
  windowMs: config.security.rateLimits.passwordReset.windowMs,
  max: config.security.rateLimits.passwordReset.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${(req.body as { email?: string }).email ?? ''}`,
  handler,
  store: new RedisStore('rl:reset:') as never,
})

// ─── General API: 100 req/min ─────────────────────────────────────────────────

export const apiRateLimit = rateLimit({
  windowMs: config.security.rateLimits.api.windowMs,
  max: config.security.rateLimits.api.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.sub ?? req.ip ?? 'unknown',
  handler,
  store: new RedisStore('rl:api:') as never,
})

// ─── Slow-down: progressively delay after 5 requests ─────────────────────────

export const loginSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 5,
  delayMs: (used) => (used - 5) * 500, // 500ms per request over limit
  keyGenerator: (req) => req.ip ?? 'unknown',
})
