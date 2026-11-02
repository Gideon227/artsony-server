import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../common/errors'
import { config } from '../config'
import { getClientIp } from '../common/utils/ip.utils'
import { parseCdnLocation } from '../modules/geo/providers/cdn-headers.provider'
import type { GeoLocation } from '../modules/geo/geo.types'

// ─── Global error handler ─────────────────────────────────────────────────────

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(err.statusCode === 422 && 'fields' in err
        ? { fields: (err as { fields?: Record<string, string> }).fields }
        : {}),
    })
    return
  }

  // Unknown error — log and return generic 500
  console.error('[UnhandledError]', err)

  res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  })
}

// ─── Not found handler ────────────────────────────────────────────────────────

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
  })
}

// ─── Request context extractor ────────────────────────────────────────────────

export function extractRequestContext(req: Request): {
  ipAddress: string | null
  userAgent: string | null
  geo: GeoLocation | null
} {
  return {
    // req.ip honours the app's `trust proxy` setting. The FIRST X-Forwarded-For
    // entry is whatever the client chose to send, so it must not be used.
    ipAddress: getClientIp(req, { trustCloudflare: config.geo.trustCloudflareIp }),
    userAgent: req.headers['user-agent'] ?? null,
    // Location Cloudflare attached to this request, when that's enabled and trusted.
    geo: parseCdnLocation(req.headers, { trust: config.geo.trustCdnHeaders }),
  }
}
