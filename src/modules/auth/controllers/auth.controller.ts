import type { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import * as authService from '../services/auth.service'
import { extractRequestContext } from '@/middleware/error.middleware'
import { config } from '@/config'
import { ValidationError } from '@/common/errors'
import type { OAuthProfile } from '@/common/types'
import { sanitiseUser } from '@/common/utils/sanitise-user'

// Profile enrichment (joining the profiles table for display_name/avatar/
// social links/etc.) must never be able to break the core auth flow —
// login, register, and /me all need to keep working even if that join
// fails for some reason (e.g. a pending migration, a transient DB issue).
// Falls back to the bare user row, which sanitiseUser can still handle.
async function withProfileOrFallback(
  user: import('@/common/types').User,
): Promise<import('@/common/types').User | import('@/common/types').UserWithProfile> {
  try {
    const { userRepository } = await import('../repositories/user.repository.js')
    const fullUser = await userRepository.findByIdWithProfile(user.id)
    return fullUser ?? user
  } catch (err) {
    console.error('[Auth] Profile enrichment failed, falling back to bare user:', err)
    return user
  }
}

const REFRESH_COOKIE = 'artsony_rt'

// Cookie helpers

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    maxAge: config.jwt.refreshTokenTtl * 1000,
    path: '/api/auth',
  })
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    path: '/api/auth',
  })
}

function getRefreshToken(req: Request): string | undefined {
  return (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]
}

// ─── Input validation chains ──────────────────────────────────────────────────

export const registerValidation = [
  body('email').isEmail().normalizeEmail().trim(),
  body('password').isLength({ min: 8, max: 128 }),
  body('username').isLength({ min: 3, max: 30 }),
  // body('displayName').isLength({ min: 2, max: 50 }).trim().escape(),
]

export const loginValidation = [
  body('email').isEmail().normalizeEmail().trim(),
  body('password').notEmpty(),
]

export const forgotPasswordValidation = [
  body('email').isEmail().normalizeEmail().trim(),
]

export const resetPasswordValidation = [
  body('token').isLength({ min: 32 }).trim(),
  body('email').isEmail().normalizeEmail().trim(),
  body('newPassword').isLength({ min: 8, max: 128 }),
]

function assertValid(req: Request): void {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const fields = Object.fromEntries(
      errors.array().map((e) => [
        'path' in e ? e.path : 'field',
        e.msg,
      ])
    )
    throw new ValidationError('Validation failed', fields)
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleRegister(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    assertValid(req)
    const { email, password, username } = req.body as {
      email: string; password: string; username: string
    }

    const ctx = extractRequestContext(req)
    const { user, tokens } = await authService.register({
      email, password, username, ctx,
    })

    setRefreshCookie(res, tokens.refreshToken)
    res.status(201).json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        user: sanitiseUser(await withProfileOrFallback(user)),
      },
    })
  } catch (err) {
    next(err)
  }
}

export async function handleLogin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    assertValid(req)
    const { email, password } = req.body as { email: string; password: string }
    const ctx = extractRequestContext(req)

    const { user, tokens } = await authService.login({ email, password, ctx })

    setRefreshCookie(res, tokens.refreshToken)
    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        user: sanitiseUser(await withProfileOrFallback(user)),
      },
    })
  } catch (err) {
    next(err)
  }
}

export async function handleRefresh(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawToken = getRefreshToken(req)
    if (!rawToken) {
      res.status(401).json({ success: false, code: 'NO_REFRESH_TOKEN' })
      return
    }

    const ctx = extractRequestContext(req)
    const tokens = await authService.refreshTokens({ rawRefreshToken: rawToken, ctx })

    setRefreshCookie(res, tokens.refreshToken)
    res.json({ success: true, data: { accessToken: tokens.accessToken } })
  } catch (err) {
    next(err)
  }
}

export async function handleLogout(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawToken = getRefreshToken(req)
    const ctx = extractRequestContext(req)

    if (rawToken && req.auth) {
      await authService.logout({
        rawRefreshToken: rawToken,
        userId: req.auth.sub,
        ctx,
      })
    }

    clearRefreshCookie(res)
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
}

export async function handleForgotPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    assertValid(req)
    const { email } = req.body as { email: string }
    const ctx = extractRequestContext(req)

    await authService.forgotPassword({ email, ctx })

    // Always 200 — never reveal if email exists
    res.json({
      success: true,
      message: 'If an account exists, a reset link has been sent.',
    })
  } catch (err) {
    next(err)
  }
}

export async function handleResetPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    assertValid(req)
    const { token, email, newPassword } = req.body as {
      token: string; email: string; newPassword: string
    }
    const ctx = extractRequestContext(req)

    await authService.resetPassword({ rawToken: token, email, newPassword, ctx })

    clearRefreshCookie(res)
    res.json({ success: true, message: 'Password updated. Please sign in.' })
  } catch (err) {
    next(err)
  }
}

export const changePasswordValidation = [
  body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8, max: 128 }),
]

export async function handleChangePassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) { res.status(401).json({ success: false }); return }

    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string }
    const ctx = extractRequestContext(req)

    await authService.changePassword({ userId: req.auth.sub, currentPassword, newPassword, ctx })

    // Sessions were just revoked (including this one) — clear the refresh
    // cookie so the client doesn't retain a dead one, same as delete/logout.
    clearRefreshCookie(res)
    res.json({ success: true, message: 'Password changed. Please sign in again.' })
  } catch (err) {
    next(err)
  }
}

export async function handleDeactivateAccount(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) { res.status(401).json({ success: false }); return }

    const { password } = req.body as { password?: string }
    const ctx = extractRequestContext(req)

    await authService.deactivateAccount({ userId: req.auth.sub, ...(password !== undefined && { password }), ctx })

    clearRefreshCookie(res)
    res.json({ success: true, message: 'Account deactivated. Log back in anytime to reactivate.' })
  } catch (err) {
    next(err)
  }
}

export async function handleDeleteAccount(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) { res.status(401).json({ success: false }); return }

    const { password } = req.body as { password?: string }
    const ctx = extractRequestContext(req)

    await authService.deleteAccount({ userId: req.auth.sub, ...(password !== undefined && { password }), ctx })

    clearRefreshCookie(res)
    res.json({ success: true, message: 'Account deletion initiated.' })
  } catch (err) {
    next(err)
  }
}

export async function handleMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) { res.status(401).json({ success: false }); return }

    const { userRepository } = await import('../repositories/user.repository.js')
    const user = await userRepository.findById(req.auth.sub)
    if (!user) { res.status(404).json({ success: false }); return }

    res.json({ success: true, data: sanitiseUser(await withProfileOrFallback(user)) })
  } catch (err) {
    next(err)
  }
}

// OAuth callbacks 

export async function handleOAuthCallback(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const profile = req.user as OAuthProfile
    const ctx = extractRequestContext(req)

    const { tokens, user, isNew } = await authService.handleOAuthProfile({ profile, ctx })

    setRefreshCookie(res, tokens.refreshToken)

    // const redirectUrl = user.onboarded
    //   ? config.app.frontendUrl
    //   : `${config.app.frontendUrl}/auth/interests`

    // const params = new URLSearchParams({
    //   access_token: tokens.accessToken,
    //   is_new: String(isNew),
    // })

    // res.redirect(`${redirectUrl}?${params.toString()}`)
    const params = new URLSearchParams({
      access_token: tokens.accessToken,
      is_new: String(isNew),
    })
 
    res.redirect(`${config.app.frontendUrl}/oauth/callback?${params.toString()}`)
  } catch (err) {
    next(err)
  }
}
