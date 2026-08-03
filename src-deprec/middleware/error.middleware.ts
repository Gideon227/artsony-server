import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../common/errors'

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
} {
  // Trust X-Forwarded-For only if behind a trusted proxy
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    null

  return {
    ipAddress: ip,
    userAgent: req.headers['user-agent'] ?? null,
  }
}
