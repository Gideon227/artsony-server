import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { randomBytes, createHash } from 'crypto'
import { config } from '@/config'
import { InvalidTokenError, TokenExpiredError } from '@/common/errors'
import type { AccessTokenPayload, UserRole } from '@/common/types'

const encoder = new TextEncoder()

function getPrivateKey() {
  return encoder.encode(config.jwt.privateKey)
}

function getPublicKey() {
  return encoder.encode(config.jwt.publicKey)
}

// ─── Access Token (JWT, RS256-equivalent with HMAC for single-server setups) ─
// For multi-service: swap HMAC for actual RS256 keypair via jose importPKCS8/importSPKI

export async function signAccessToken(payload: {
  userId: string
  sessionId: string
  role: UserRole
  tokenVersion: number
}): Promise<string> {
  const jwt = await new SignJWT({
    sub: payload.userId,
    sid: payload.sessionId,
    role: payload.role,
    ver: payload.tokenVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${config.jwt.accessTokenTtl}s`)
    .setIssuer(config.jwt.issuer)
    .setAudience(config.jwt.audience)
    .sign(getPrivateKey())

  return jwt
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, getPublicKey(), {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithms: ['HS256'],
    })
    return payload as unknown as AccessTokenPayload
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('expired')) {
      throw new TokenExpiredError()
    }
    throw new InvalidTokenError()
  }
}

// ─── Refresh Token (opaque, stored as SHA-256 hash) ──────────────────────────

export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(64).toString('base64url')
  const hash = hashToken(raw)
  return { raw, hash }
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

// ─── Secure random tokens for reset / email verify ───────────────────────────

export function generateSecureToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(raw).digest('hex')
  return { raw, hash }
}

// ─── OAuth state parameter (CSRF protection) ─────────────────────────────────

export function generateOAuthState(): string {
  return randomBytes(32).toString('base64url')
}
