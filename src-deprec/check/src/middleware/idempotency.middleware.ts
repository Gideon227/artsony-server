import type { Request, Response, NextFunction } from 'express'
import { redisGetJson, redisSetJson, RedisKeys, RedisTTL } from '@/modules/redis/redis.client'
import { ValidationError } from '@/common/errors'

// ── Types ─────────────────────────────────────────────────────────────────────

type CachedResponse = {
  status:  number
  body:    unknown
  headers: Record<string, string>
}

// ── Middleware factory ─────────────────────────────────────────────────────────

export function idempotencyGuard() {
  return async function (
    req:  Request,
    res:  Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.auth) return next()

    const rawKey = req.headers['idempotency-key'] as string | undefined
    if (!rawKey) return next()

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawKey)) {
      next(new ValidationError('Validation failed', {
        'idempotency-key': 'Idempotency-Key must be a valid UUID',
      }))
      return
    }

    const key = RedisKeys.httpIdempotency(req.auth.sub, rawKey)

    const cached = await redisGetJson<CachedResponse>(key)
    if (cached) {
      for (const [name, value] of Object.entries(cached.headers)) {
        res.setHeader(name, value)
      }
      res.setHeader('Idempotent-Replayed', 'true')
      res.status(cached.status).json(cached.body)
      return
    }

    const originalJson = res.json.bind(res)

    res.json = function (body: unknown): Response {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const toStore: CachedResponse = {
          status:  res.statusCode,
          body,
          headers: {
            'Content-Type': res.getHeader('Content-Type') as string ?? 'application/json',
          },
        }
        void redisSetJson(key, toStore, RedisTTL.httpIdempotency)
      }
      return originalJson(body)
    }

    next()
  }
}