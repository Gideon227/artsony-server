import rateLimit from 'express-rate-limit'
import slowDown from 'express-slow-down'
import { getRedis } from '../modules/redis/redis.client'
import { config } from '../config'
import { TooManyRequestsError } from '../common/errors'
import type { Request, Response } from 'express'

class RedisStore {
  private prefix: string
  private windowSeconds: number

  constructor(prefix: string, windowMs: number) {
    this.prefix = prefix
    this.windowSeconds = Math.ceil(windowMs / 1000)
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
      await redis.expire(redisKey, this.windowSeconds)
    }

    const resetTime = ttl > 0
      ? new Date(Date.now() + ttl * 1000)
      : new Date(Date.now() + this.windowSeconds * 1000)

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

// ─── Register: separate bucket, keyed by IP ──────────────────────────────────
// FIX: previously shared the same 'authRateLimit' instance (and therefore the
// same Redis counter) as /login and /reset-password. A few signup retries
// could exhaust the quota before the user ever reached the login form.

export const registerRateLimit = rateLimit({
  windowMs: config.security.rateLimits.auth.windowMs,
  max: config.security.rateLimits.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler,
  store: new RedisStore('rl:register:', config.security.rateLimits.auth.windowMs) as never,
})

// ─── Login: its own bucket, separate from register/reset ─────────────────────

export const loginRateLimit = rateLimit({
  windowMs: config.security.rateLimits.auth.windowMs,
  max: config.security.rateLimits.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler,
  store: new RedisStore('rl:login:', config.security.rateLimits.auth.windowMs) as never,
})

// ─── Password reset (auth-side, e.g. /reset-password): its own bucket ────────

export const resetPasswordRateLimit = rateLimit({
  windowMs: config.security.rateLimits.auth.windowMs,
  max: config.security.rateLimits.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler,
  store: new RedisStore('rl:reset-pw:', config.security.rateLimits.auth.windowMs) as never,
})

// ─── Forgot-password request: 3 requests per hour ─────────────────────────────

export const resetRateLimit = rateLimit({
  windowMs: config.security.rateLimits.passwordReset.windowMs,
  max: config.security.rateLimits.passwordReset.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${(req.body as { email?: string }).email ?? ''}`,
  handler,
  store: new RedisStore('rl:reset:', config.security.rateLimits.passwordReset.windowMs) as never,
})

// ─── General API: 100 req/min ─────────────────────────────────────────────────

export const apiRateLimit = rateLimit({
  windowMs: config.security.rateLimits.api.windowMs,
  max: config.security.rateLimits.api.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.sub ?? req.ip ?? 'unknown',
  handler,
  store: new RedisStore('rl:api:', config.security.rateLimits.api.windowMs) as never,
})

// ─── Slow-down: progressively delay after 5 requests ─────────────────────────

export const loginSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 5,
  delayMs: (used) => (used - 5) * 500, // 500ms per request over limit
  keyGenerator: (req) => req.ip ?? 'unknown',
})