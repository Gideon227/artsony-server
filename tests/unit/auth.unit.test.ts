import { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken, generateSecureToken } from '../../src/modules/auth/services/token.service'
import { hashPassword, verifyPassword, validatePasswordComplexity } from '../../src/modules/auth/services/password.service'
import { ValidationError } from '../../src/common/errors'

// ─── Token Service ────────────────────────────────────────────────────────────

describe('TokenService', () => {
  const payload = {
    userId: 'user-123',
    sessionId: 'session-456',
    role: 'USER' as const,
    tokenVersion: 0,
  }

  describe('signAccessToken / verifyAccessToken', () => {
    it('issues a verifiable JWT with correct claims', async () => {
      const token = await signAccessToken(payload)
      expect(typeof token).toBe('string')
      expect(token.split('.')).toHaveLength(3)

      const decoded = await verifyAccessToken(token)
      expect(decoded.sub).toBe(payload.userId)
      expect(decoded.sid).toBe(payload.sessionId)
      expect(decoded.role).toBe(payload.role)
      expect(decoded.ver).toBe(payload.tokenVersion)
    })

    it('throws TokenExpiredError for an expired token', async () => {
      // Fabricate an already-expired token by mocking Date
      const realNow = Date.now
      Date.now = () => new Date('2020-01-01').getTime()
      const oldToken = await signAccessToken(payload)
      Date.now = realNow

      await expect(verifyAccessToken(oldToken)).rejects.toMatchObject({
        code: 'TOKEN_EXPIRED',
      })
    })

    it('throws InvalidTokenError for a tampered token', async () => {
      const token = await signAccessToken(payload)
      const tampered = token.slice(0, -5) + 'XXXXX'
      await expect(verifyAccessToken(tampered)).rejects.toMatchObject({
        code: 'INVALID_TOKEN',
      })
    })
  })

  describe('generateRefreshToken', () => {
    it('returns distinct raw and hash', () => {
      const { raw, hash } = generateRefreshToken()
      expect(raw).not.toBe(hash)
      expect(raw.length).toBeGreaterThanOrEqual(80)
      expect(hash.length).toBe(64) // SHA-256 hex
    })

    it('hash is deterministic for same input', () => {
      const { raw } = generateRefreshToken()
      expect(hashToken(raw)).toBe(hashToken(raw))
    })

    it('two tokens are never identical', () => {
      const a = generateRefreshToken()
      const b = generateRefreshToken()
      expect(a.raw).not.toBe(b.raw)
      expect(a.hash).not.toBe(b.hash)
    })
  })

  describe('generateSecureToken', () => {
    it('produces 32-byte base64url raw token', () => {
      const { raw } = generateSecureToken()
      const decoded = Buffer.from(raw, 'base64url')
      expect(decoded.length).toBe(32)
    })
  })
})

// ─── Password Service ─────────────────────────────────────────────────────────

describe('PasswordService', () => {
  describe('hashPassword / verifyPassword', () => {
    it('verifies a correct password', async () => {
      const hash = await hashPassword('SecurePass1!')
      expect(await verifyPassword(hash, 'SecurePass1!')).toBe(true)
    })

    it('rejects a wrong password', async () => {
      const hash = await hashPassword('SecurePass1!')
      expect(await verifyPassword(hash, 'WrongPass1!')).toBe(false)
    })

    it('produces unique hashes for same input (random salt)', async () => {
      const h1 = await hashPassword('SecurePass1!')
      const h2 = await hashPassword('SecurePass1!')
      expect(h1).not.toBe(h2)
    })

    it('returns false (not throw) on malformed hash', async () => {
      expect(await verifyPassword('not-a-hash', 'anything')).toBe(false)
    })
  })

  describe('validatePasswordComplexity', () => {
    const valid = 'ValidPass1!'

    it('accepts a strong password', () => {
      expect(() => validatePasswordComplexity(valid)).not.toThrow()
    })

    it('rejects password shorter than 8 chars', () => {
      expect(() => validatePasswordComplexity('Ab1!')).toThrow(ValidationError)
    })

    it('rejects password without uppercase', () => {
      expect(() => validatePasswordComplexity('lowercase1!')).toThrow(ValidationError)
    })

    it('rejects password without digit', () => {
      expect(() => validatePasswordComplexity('NoDigitHere!')).toThrow(ValidationError)
    })

    it('rejects password without special character', () => {
      expect(() => validatePasswordComplexity('NoSpecial1')).toThrow(ValidationError)
    })

    it('rejects password exceeding max length', () => {
      const huge = 'A1!'.repeat(50)
      expect(() => validatePasswordComplexity(huge)).toThrow(ValidationError)
    })
  })
})
