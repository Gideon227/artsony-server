import { Router } from 'express'
import { passport } from '../auth/strategies/oauth.strategies'
import {
  handleRegister, handleLogin, handleLogout, handleRefresh,
  handleForgotPassword, handleResetPassword, handleDeleteAccount,
  handleMe, handleOAuthCallback,
  registerValidation, loginValidation,
  forgotPasswordValidation, resetPasswordValidation,
} from '../auth/controllers/auth.controller'
import { requireAuth } from '@/middleware/auth.middleware'
import {
  authRateLimit, resetRateLimit, loginSlowDown,
} from '@/middleware/rate-limit.middleware'
import { generateOAuthState } from '../auth/services/token.service'
import { redisSet, RedisKeys } from '../redis/redis.client'
import { config } from '@/config'
import type { Request, Response, NextFunction } from 'express'

const router = Router()

// ─── Local auth ───────────────────────────────────────────────────────────────

router.post('/register', authRateLimit, registerValidation, handleRegister)
router.post('/login', authRateLimit, loginSlowDown, loginValidation, handleLogin)
router.post('/logout', requireAuth, handleLogout)
router.post('/refresh', handleRefresh)
router.get('/me', requireAuth, handleMe)
router.delete('/account', requireAuth, handleDeleteAccount)

// ─── Password reset ───────────────────────────────────────────────────────────

router.post(
  '/forgot-password',
  resetRateLimit,
  forgotPasswordValidation,
  handleForgotPassword
)

router.post(
  '/reset-password',
  authRateLimit,
  resetPasswordValidation,
  handleResetPassword
)

// ─── Google OAuth ─────────────────────────────────────────────────────────────
// Setup: https://console.developers.google.com
// 1. Create project → Enable "Google+ API" and "Google Identity API"
// 2. OAuth consent screen → External → add scopes: email, profile
// 3. Credentials → Create OAuth 2.0 Client ID → Web Application
// 4. Authorised redirect URIs: https://api.artsony.com/api/oauth/google/callback
// 5. Env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL

router.get(
  '/oauth/google',
  generateStateMiddleware,
  passport.authenticate('google', { session: false, scope: ['email', 'profile'] })
)

router.get(
  '/oauth/google/callback',
  validateStateMiddleware,
  passport.authenticate('google', { session: false, failureRedirect: `${config.app.frontendUrl}/auth/login?error=oauth_failed` }),
  handleOAuthCallback
)

// ─── Facebook OAuth ───────────────────────────────────────────────────────────
// Setup: https://developers.facebook.com
// 1. Create App → Consumer type
// 2. Add "Facebook Login" product → Settings
// 3. Valid OAuth Redirect URIs: https://api.artsony.com/api/oauth/facebook/callback
// 4. Required permissions: email, public_profile
// 5. Env vars: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_CALLBACK_URL
// Note: Apple OAuth excluded — Apple Developer license required ($99/yr)

router.get(
  '/oauth/facebook',
  generateStateMiddleware,
  passport.authenticate('facebook', { session: false, scope: ['email'] })
)

router.get(
  '/oauth/facebook/callback',
  validateStateMiddleware,
  passport.authenticate('facebook', { session: false, failureRedirect: `${config.app.frontendUrl}/auth/login?error=oauth_failed` }),
  handleOAuthCallback
)

// ─── OAuth CSRF state helpers ─────────────────────────────────────────────────

async function generateStateMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const state = generateOAuthState()
  await redisSet(RedisKeys.oauthState(state), '1', 300) // 5 min TTL
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: 'lax',
    maxAge: 300_000,
  })
  // Attach state to query for passport
  req.query['state'] = state
  next()
}

async function validateStateMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const cookieState = (req.cookies as Record<string, string | undefined>)['oauth_state']
  const queryState = req.query['state'] as string | undefined

  if (!cookieState || !queryState || cookieState !== queryState) {
    res.redirect(`${config.app.frontendUrl}/auth/login?error=csrf_failed`)
    return
  }

  const { redisGet, redisDel } = await import('../redis/redis.client.js')
  const stored = await redisGet(RedisKeys.oauthState(queryState))
  if (!stored) {
    res.redirect(`${config.app.frontendUrl}/auth/login?error=state_expired`)
    return
  }

  await redisDel(RedisKeys.oauthState(queryState))
  res.clearCookie('oauth_state')
  next()
}

export { router as authRouter }
