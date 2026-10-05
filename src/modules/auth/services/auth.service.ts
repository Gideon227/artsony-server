import { v4 as uuidv4 } from 'uuid'
import { config } from '@/config'
import { userRepository } from '../repositories/user.repository'
import { sessionRepository } from '../repositories/session.repository'
import { resetTokenRepository } from '../repositories/reset-token.repository'
import { auditRepository } from '../repositories/audit.repository'
import { emailService } from '../../email/email.service'
import { scheduleAccountPurge } from '../jobs/account-purge.job'
import {
  hashPassword,
  verifyPassword,
  validatePasswordComplexity,
  needsRehash,
} from './password.service'
import {
  signAccessToken,
  generateRefreshToken,
  generateSecureToken,
  hashToken,
} from './token.service'
import {
  RedisKeys,
  RedisTTL,
  redisSet,
  redisSetNx,
  redisGet,
  redisDel,
  redisIncr,
  redisSetJson,
  redisGetJson,
} from '../../redis/redis.client'
import {
  ConflictError,
  UnauthorizedError,
  AccountLockedError,
  NotFoundError,
  ValidationError,
  InvalidTokenError,
  TooManyRequestsError,
} from '@/common/errors'
import type { User, OAuthProfile } from '@/common/types'

type TokenPair = {
  accessToken: string
  refreshToken: string        // raw — set as httpOnly cookie
  sessionId: string
}

type AuthContext = {
  ipAddress: string | null
  userAgent: string | null
}

// ─── Register ─────────────────────────────────────────────────────────────────

export async function register(input: {
  email: string
  password: string
  username: string
  ctx: AuthContext
}): Promise<{ user: User; tokens: TokenPair }> {
  validatePasswordComplexity(input.password)

  const existing = await userRepository.findByEmail(input.email)
  if (existing) {
    await hashPassword(input.password)
    throw new ConflictError('An account with this email already exists')
  }

  const passwordHash = await hashPassword(input.password)

  const user = await userRepository.create({
    username: input.username,
    email: input.email,
    password_hash: passwordHash,
    provider: 'local',
  })

  const tokens = await issueTokenPair(user, input.ctx)

  emailService.sendWelcomeEmail({ to: user['email'], displayName: input.username }).catch(
    (err) => console.error('[Auth] Welcome email failed:', err)
  )

  auditRepository.log(buildAudit('AUTH_REGISTER', user['id'], input.ctx))

  return { user, tokens }
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function login(input: {
  email: string
  password: string
  ctx: AuthContext
}): Promise<{ user: User; tokens: TokenPair }> {
  const lockKey = RedisKeys.lockout(input.email)
  const isLocked = await redisGet(lockKey)

  if (isLocked) {
    throw new TooManyRequestsError(
      'Account is temporarily locked. Please try again later.'
    )
  }

  const user = await userRepository.findByEmail(input.email)

  const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder'
  const candidateHash = user ? user['password_hash'] ?? dummyHash : dummyHash

  const isValid = await verifyPassword(candidateHash, input.password)

  if (!user || !isValid) {
    await handleFailedLogin(input.email, user ?? null, input.ctx)
    throw new UnauthorizedError('Invalid email or password')
  }

  if (user['status'] === 'SUSPENDED') {
    throw new UnauthorizedError('Account suspended. Contact support.')
  }

  if (user['status'] === 'DELETED') {
    throw new UnauthorizedError('Account not found')
  }

  // Deactivation is self-service and immediately reversible — unlike
  // SUSPENDED/DELETED, a successful login (meaning the password check
  // above already passed) reactivates the account automatically rather
  // than blocking sign-in.
  if (user['status'] === 'DEACTIVATED') {
    await userRepository.update(user['id'], { status: 'ACTIVE' })
    user['status'] = 'ACTIVE'
    auditRepository.log(buildAudit('AUTH_ACCOUNT_REACTIVATED', user['id'], input.ctx))
  }

  if (user['locked_until'] && user['locked_until'] > new Date()) {
    throw new AccountLockedError(user['locked_until'])
  }

  if (user['password_hash'] && await needsRehash(user['password_hash'])) {
    const newHash = await hashPassword(input.password)
    await userRepository.update(user['id'], { password_hash: newHash })
  }

  await userRepository.recordLoginAttempt(user['id'], true)

  const tokens = await issueTokenPair(user, input.ctx)

  auditRepository.log(buildAudit('AUTH_LOGIN', user['id'], input.ctx))

  return { user, tokens }
}

async function handleFailedLogin(
  email: string,
  user: User | null,
  ctx: AuthContext
): Promise<void> {
  const attemptsKey = RedisKeys.loginAttempts(email)
  const windowSeconds = 15 * 60
  const attempts = await redisIncr(attemptsKey, windowSeconds)

  if (user) {
    await userRepository.recordLoginAttempt(user['id'], false)
  }

  auditRepository.log(
    buildAudit('AUTH_LOGIN_FAILED', user ? user['id'] : null, ctx, { email, attempts })
  )

  if (attempts >= config.security.loginMaxAttempts) {
    const lockDurationSeconds = config.security.loginLockoutMinutes * 60
    await redisSet(RedisKeys.lockout(email), '1', lockDurationSeconds)

    if (user) {
      const lockedUntil = new Date(Date.now() + lockDurationSeconds * 1000)
      await userRepository.lockAccount(user['id'], lockedUntil)
    }

    auditRepository.log(
      buildAudit('AUTH_ACCOUNT_LOCKED', user ? user['id'] : null, ctx, { email, attempts })
    )
  }
}

// ─── Refresh Token ────────────────────────────────────────────────────────────

// The blacklist key doubles as the rotation lock: the first request to present
// a refresh token claims it as ROTATING (SET NX), and once the new session and
// the grace entry exist it is upgraded to CONSUMED. A request that loses the
// claim is either racing that in-flight rotation — multi-tab, or a page's
// bootstrap refresh overlapping an API call's 401 refresh — or replaying a
// token consumed earlier. Only the first case may receive the winner's tokens.
const RT_ROTATING = 'rotating'
const RT_CONSUMED = '1'
const RT_WAIT_TIMEOUT_MS = 5_000
const RT_WAIT_POLL_MS = 50
const RT_MAX_CLAIM_ATTEMPTS = 3

type ConcurrentRefreshOutcome =
  | { type: 'tokens'; tokens: TokenPair }
  | { type: 'consumed' }
  | { type: 'released' }
  | { type: 'timeout' }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// The marker is read before the grace entry on purpose: the winner writes the
// grace entry before it upgrades the marker, so a marker that is no longer
// ROTATING guarantees the grace entry is already visible to the read after it.
async function waitForConcurrentRefresh(incomingHash: string): Promise<ConcurrentRefreshOutcome> {
  const deadline = Date.now() + RT_WAIT_TIMEOUT_MS

  for (;;) {
    const marker = await redisGet(RedisKeys.rtBlacklist(incomingHash))
    const graced = await redisGetJson<TokenPair>(RedisKeys.rtGrace(incomingHash))

    if (graced) return { type: 'tokens', tokens: graced }
    if (marker === null) return { type: 'released' }
    if (marker !== RT_ROTATING) return { type: 'consumed' }
    if (Date.now() >= deadline) return { type: 'timeout' }

    await sleep(RT_WAIT_POLL_MS)
  }
}

async function handleRefreshTokenReuse(incomingHash: string, ctx: AuthContext): Promise<never> {
  const session = await sessionRepository.findByTokenHash(incomingHash)
  if (session) {
    await sessionRepository.revokeAllForUser(session['user_id'])
    auditRepository.log(
      buildAudit('AUTH_SUSPICIOUS_REFRESH', session['user_id'], ctx, {
        reason: 'blacklisted_token_reuse',
      })
    )
  }
  throw new InvalidTokenError()
}

async function rotateRefreshToken(incomingHash: string, ctx: AuthContext): Promise<TokenPair> {
  let rotated = false

  try {
    const session = await sessionRepository.findByTokenHash(incomingHash)
    if (!session) throw new InvalidTokenError()

    const user = await userRepository.findById(session['user_id'])
    if (!user || user['status'] !== 'ACTIVE') throw new UnauthorizedError()

    const { raw: newRaw, hash: newHash } = generateRefreshToken()

    const newSession = await sessionRepository.rotate({
      oldSessionId: session['id'],
      userId: user['id'],
      newTokenHash: newHash,
      userAgent: ctx.userAgent,
      ipAddress: ctx.ipAddress,
    })
    rotated = true

    const accessToken = await signAccessToken({
      userId: user['id'],
      sessionId: newSession['id'],
      role: user['role'],
      tokenVersion: user['token_version'],
    })

    const tokens: TokenPair = { accessToken, refreshToken: newRaw, sessionId: newSession['id'] }

    await redisSetJson(RedisKeys.rtGrace(incomingHash), tokens, RedisTTL.rtGraceWindow)
    await redisSet(RedisKeys.rtBlacklist(incomingHash), RT_CONSUMED, config.jwt.refreshTokenTtl)

    auditRepository.log(buildAudit('AUTH_REFRESH', user['id'], ctx))

    return tokens
  } catch (err) {
    // Until the old session is actually rotated the token has not been
    // consumed, so hand the claim back instead of poisoning a valid token.
    if (!rotated) await redisDel(RedisKeys.rtBlacklist(incomingHash))
    throw err
  }
}

export async function refreshTokens(input: {
  rawRefreshToken: string
  ctx: AuthContext
}): Promise<TokenPair> {
  const incomingHash = hashToken(input.rawRefreshToken)

  for (let attempt = 0; attempt < RT_MAX_CLAIM_ATTEMPTS; attempt++) {
    const claimed = await redisSetNx(
      RedisKeys.rtBlacklist(incomingHash),
      RT_ROTATING,
      RedisTTL.rtClaim
    )
    if (claimed) return rotateRefreshToken(incomingHash, input.ctx)

    const outcome = await waitForConcurrentRefresh(incomingHash)
    if (outcome.type === 'tokens') return outcome.tokens
    if (outcome.type === 'consumed') return handleRefreshTokenReuse(incomingHash, input.ctx)
    if (outcome.type === 'timeout') break
  }

  // Not a replay: the rotation we raced is still unresolved (or kept failing),
  // so this is a transient server-side condition and must not revoke sessions.
  throw new Error('[Auth] Refresh rotation did not settle')
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(input: {
  rawRefreshToken: string
  userId: string
  ctx: AuthContext
}): Promise<void> {
  const hash = hashToken(input.rawRefreshToken)
  const session = await sessionRepository.findByTokenHash(hash)

  if (session) {
    await sessionRepository.revokeById(session['id'])
    await redisSet(RedisKeys.rtBlacklist(hash), '1', config.jwt.refreshTokenTtl)
  }

  auditRepository.log(buildAudit('AUTH_LOGOUT', input.userId, input.ctx))
}

// ─── Forgot Password ──────────────────────────────────────────────────────────

export async function forgotPassword(input: {
  email: string
  ctx: AuthContext
}): Promise<void> {
  const attemptsKey = RedisKeys.resetAttempts(input.email)
  const attempts = await redisIncr(attemptsKey, 3600)

  if (attempts > config.security.resetMaxAttempts) {
    throw new TooManyRequestsError(
      'Too many reset requests. Try again in an hour.'
    )
  }

  const user = await userRepository.findByEmail(input.email)
  if (!user) return

  const { raw, hash } = generateSecureToken()

  await resetTokenRepository.create({
    userId: user['id'],
    tokenHash: hash,
    email: input.email,
  })

  const resetUrl = `${config.app.frontendUrl}/reset-password?token=${raw}&email=${encodeURIComponent(input.email)}`

  try {
    await emailService.sendPasswordResetEmail({
      to: input.email,
      resetUrl,
      expiryMinutes: config.security.resetTokenExpiryMinutes,
    })
  } catch (err) {
    // The reset token is already created and valid — a queueing hiccup here
    // shouldn't fail (or hang) the request, and staying silent here also
    // preserves the same response shape whether or not the account exists.
    console.error('[forgotPassword] Failed to enqueue reset email:', (err as Error).message)
  }

  auditRepository.log(
    buildAudit('AUTH_PASSWORD_RESET_REQUEST', user['id'], input.ctx, { email: input.email })
  )
}

// ─── Reset Password ───────────────────────────────────────────────────────────

export async function resetPassword(input: {
  rawToken: string
  email: string
  newPassword: string
  ctx: AuthContext
}): Promise<void> {
  validatePasswordComplexity(input.newPassword)

  const tokenHash = hashToken(input.rawToken)

  const record = await resetTokenRepository.findValid({
    tokenHash,
    email: input.email,
  })

  if (!record) {
    await resetTokenRepository.incrementAttempts(tokenHash)
    throw new InvalidTokenError()
  }

  if (record['reset_attempts'] >= config.security.resetMaxAttempts) {
    throw new TooManyRequestsError('Reset token attempt limit exceeded.')
  }

  const newHash = await hashPassword(input.newPassword)

  await Promise.all([
    userRepository.update(record['user_id'], { password_hash: newHash }),
    userRepository.incrementTokenVersion(record['user_id']),
    resetTokenRepository.markUsed(record['id']),
    sessionRepository.revokeAllForUser(record['user_id']),
  ])

  auditRepository.log(buildAudit('AUTH_PASSWORD_RESET_SUCCESS', record['user_id'], input.ctx))
}

// ─── OAuth Login / Register ───────────────────────────────────────────────────

export async function handleOAuthProfile(input: {
  profile: OAuthProfile
  ctx: AuthContext
}): Promise<{ user: User; tokens: TokenPair; isNew: boolean }> {
  const { profile } = input

  let user = await userRepository.findByProviderId(
    profile.provider,
    profile.providerId
  )

  if (!user) {
    const byEmail = await userRepository.findByEmail(profile.email)
    if (byEmail) {
      user = await userRepository.update(byEmail['id'], {
        provider_id: profile.providerId,
        is_email_verified: true,
      })
    }
  }

  const isNew = !user

  if (!user) {
    user = await userRepository.create({
      username: profile.displayName,
      email: profile.email,
      provider: profile.provider,
      provider_id: profile.providerId,
    })

    emailService.sendWelcomeEmail({
      to: profile.email,
      displayName: profile.displayName,
    }).catch((err) => console.error('[Auth] OAuth welcome email failed:', err))
  }

  if (user['status'] !== 'ACTIVE') throw new UnauthorizedError('Account unavailable')

  const tokens = await issueTokenPair(user, input.ctx)

  auditRepository.log(
    buildAudit('AUTH_OAUTH_LOGIN', user['id'], input.ctx, { provider: profile.provider, isNew })
  )

  return { user, tokens, isNew }
}

// ─── Delete Account ───────────────────────────────────────────────────────────

export async function deleteAccount(input: {
  userId: string
  password?: string
  ctx: AuthContext
}): Promise<void> {
  const user = await userRepository.findById(input.userId)
  if (!user) throw new NotFoundError('User')

  if (user['provider'] === 'local') {
    if (!input.password) throw new ValidationError('Password confirmation required')
    if (!user['password_hash']) throw new UnauthorizedError()

    const valid = await verifyPassword(user['password_hash'], input.password)
    if (!valid) throw new UnauthorizedError('Incorrect password')
  }

  await Promise.all([
    userRepository.softDelete(user['id']),
    sessionRepository.revokeAllForUser(user['id']),
    userRepository.incrementTokenVersion(user['id']),
  ])

  const scheduledAt = new Date(
    Date.now() + config.queue.accountDeletionGraceDays * 24 * 60 * 60 * 1000
  )

  // Actually enforce the grace period promised below — previously this was
  // never scheduled anywhere, so accounts stayed soft-deleted indefinitely.
  await scheduleAccountPurge(user['id'])

  await emailService.sendAccountDeletionConfirmation({
    to: user['email'],
    displayName: user['email'],
    scheduledAt,
  })

  auditRepository.log(
    buildAudit('AUTH_ACCOUNT_DELETE_INITIATED', user['id'], input.ctx, { scheduledAt })
  )
}

// ─── Change Password (while signed in) ─────────────────────────────────────
// Distinct from resetPassword — that flow is for a locked-out user via an
// emailed token; this is for a signed-in user who knows their current
// password. Revokes all sessions and bumps token_version on success,
// including the session making this request — the caller must expect to
// need a fresh login afterward, same security posture as resetPassword.

export async function changePassword(input: {
  userId: string
  currentPassword: string
  newPassword: string
  ctx: AuthContext
}): Promise<void> {
  const user = await userRepository.findById(input.userId)
  if (!user) throw new NotFoundError('User')

  if (user['provider'] !== 'local' || !user['password_hash']) {
    throw new ValidationError('Validation failed', {
      password: 'This account signs in via a social provider and has no password to change',
    })
  }

  const valid = await verifyPassword(user['password_hash'], input.currentPassword)
  if (!valid) throw new UnauthorizedError('Current password is incorrect')

  validatePasswordComplexity(input.newPassword)
  const newHash = await hashPassword(input.newPassword)

  await Promise.all([
    userRepository.update(user['id'], { password_hash: newHash }),
    userRepository.incrementTokenVersion(user['id']),
    sessionRepository.revokeAllForUser(user['id']),
  ])

  auditRepository.log(buildAudit('AUTH_PASSWORD_CHANGED', user['id'], input.ctx))
}

// ─── Deactivate Account ─────────────────────────────────────────────────────
// Self-service and immediately reversible by logging back in (see the
// DEACTIVATED branch in login() above) — distinct from deleteAccount,
// which starts an irreversible-after-the-grace-period purge.

export async function deactivateAccount(input: {
  userId: string
  password?: string
  ctx: AuthContext
}): Promise<void> {
  const user = await userRepository.findById(input.userId)
  if (!user) throw new NotFoundError('User')

  if (user['provider'] === 'local') {
    if (!input.password) throw new ValidationError('Password confirmation required')
    if (!user['password_hash']) throw new UnauthorizedError()

    const valid = await verifyPassword(user['password_hash'], input.password)
    if (!valid) throw new UnauthorizedError('Incorrect password')
  }

  await Promise.all([
    userRepository.update(user['id'], { status: 'DEACTIVATED' }),
    sessionRepository.revokeAllForUser(user['id']),
    userRepository.incrementTokenVersion(user['id']),
  ])

  auditRepository.log(buildAudit('AUTH_ACCOUNT_DEACTIVATED', user['id'], input.ctx))
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function issueTokenPair(user: User, ctx: AuthContext): Promise<TokenPair> {
  const { raw, hash } = generateRefreshToken()

  const session = await sessionRepository.create({
    userId: user['id'],
    refreshTokenHash: hash,
    userAgent: ctx.userAgent,
    ipAddress: ctx.ipAddress,
  })

  const accessToken = await signAccessToken({
    userId: user['id'],
    sessionId: session['id'],
    role: user['role'],
    tokenVersion: user['token_version'],
  })

  return { accessToken, refreshToken: raw, sessionId: session['id'] }
}

/**
 * Safely constructs the audit payload without explicitly setting 'undefined' keys,
 * solving strict exactOptionalPropertyTypes compiler errors.
 */
function buildAudit(
  action: string,
  userId: string | null | undefined,
  ctx: AuthContext,
  metadata?: Record<string, unknown>
) {
  const payload: Record<string, any> = { action }
  
  if (userId) payload['userId'] = userId
  if (ctx.ipAddress) payload['ipAddress'] = ctx.ipAddress
  if (ctx.userAgent) payload['userAgent'] = ctx.userAgent
  if (metadata) payload['metadata'] = metadata
  
  return payload as any
}