import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../modules/auth/services/token.service'
import { userRepository } from '../modules/auth/repositories/user.repository'
import {
  UnauthorizedError,
  ForbiddenError,
} from '../common/errors'
import type { UserRole, AccessTokenPayload } from '../common/types'

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload
    }
  }
}

// ─── Extract Bearer token from Authorization header ───────────────────────────

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  return header.slice(7)
}

// ─── requireAuth — verifies JWT and attaches payload to req.auth ──────────────

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req)
    if (!token) throw new UnauthorizedError()

    const payload = await verifyAccessToken(token)

    // Verify token version against DB — invalidated on password change
    const user = await userRepository.findById(payload.sub)
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedError()
    if (user.token_version !== payload.ver) throw new UnauthorizedError('Session invalidated')

    req.auth = payload
    next()
  } catch (err) {
    next(err)
  }
}

// ─── authorize — role-based access control middleware factory ─────────────────

export function authorize(roles: UserRole[]) {
  return function (req: Request, _res: Response, next: NextFunction): void {
    if (!req.auth) {
      return next(new UnauthorizedError())
    }
    if (!roles.includes(req.auth.role)) {
      return next(new ForbiddenError('Insufficient permissions'))
    }
    next()
  }
}

// ─── requireOnboarded — blocks access if user hasn't completed onboarding ─────

export async function requireOnboarded(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()

    const user = await userRepository.findById(req.auth.sub)
    if (!user) throw new UnauthorizedError()

    if (!user.onboarded) {
      res.status(403).json({
        code: 'ONBOARDING_REQUIRED',
        redirectTo: '/auth/interests',
      })
      return
    }

    next()
  } catch (err) {
    next(err)
  }
}

// ─── optionalAuth — attaches auth payload if token present, doesn't throw ─────

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerToken(req)
  if (!token) return next()

  try {
    req.auth = await verifyAccessToken(token)
  } catch {
    // Silently ignore invalid token for optional auth routes
  }
  next()
}
