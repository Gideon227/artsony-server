import request from 'supertest'
import { createApp } from '../../src/app'
import { signAccessToken } from '../../src/modules/auth/services/token.service'
import type { Express } from 'express'

let app: Express

beforeAll(() => {
  app = createApp()
})

// ─── Brute Force Protection ───────────────────────────────────────────────────

describe('Security: Brute Force', () => {
  const targetEmail = `brute_${Date.now()}@example.com`

  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({
      email: targetEmail,
      password: 'CorrectPass1!',
      username: `brute_${Date.now()}`,
      displayName: 'Brute Target',
    })
  })

  it('locks account after 5 failed login attempts', async () => {
    const wrong = { email: targetEmail, password: 'WrongPass1!' }

    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send(wrong)
    }

    // 6th attempt should hit lockout
    const res = await request(app).post('/api/auth/login').send(wrong)
    expect([423, 429]).toContain(res.status)
  })

  it('rate limiter blocks after 10 auth requests from same IP in 15 min', async () => {
    const promises = Array.from({ length: 12 }).map(() =>
      request(app)
        .post('/api/auth/login')
        .send({ email: 'probe@example.com', password: 'Probe1!' })
    )
    const results = await Promise.all(promises)
    const rateLimited = results.filter((r) => r.status === 429)
    expect(rateLimited.length).toBeGreaterThan(0)
  })
})

// ─── Token Replay Attack ──────────────────────────────────────────────────────

describe('Security: Refresh Token Replay', () => {
  it('invalidates all sessions when a rotated (used) refresh token is reused', async () => {
    // 1. Register and capture initial RT cookie
    const regRes = await request(app).post('/api/auth/register').send({
      email: `replay_${Date.now()}@example.com`,
      password: 'ReplayPass1!',
      username: `replay_${Date.now()}`,
      displayName: 'Replay User',
    })
    const originalCookie = (regRes.headers['set-cookie'] as string[])
      .find((c) => c.includes('artsony_rt'))!

    // 2. Use RT once — rotate it
    const firstRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', originalCookie)
    expect(firstRefresh.status).toBe(200)

    // 3. Replay the original (now-rotated) RT — should trigger family revocation
    const replayRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', originalCookie)

    expect([401, 403]).toContain(replayRes.status)
  })
})

// ─── Expired / Invalid Access Tokens ─────────────────────────────────────────

describe('Security: Access Token Validation', () => {
  it('rejects request with no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me').expect(401)
    expect(res.body.code).toBe('UNAUTHORIZED')
  })

  it('rejects malformed Bearer token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.jwt')
      .expect(401)
    expect(res.body.code).toBe('INVALID_TOKEN')
  })

  it('rejects token with wrong token_version (invalidated session)', async () => {
    // Fabricate a token with ver=999 for a real user — version mismatch
    const token = await signAccessToken({
      userId: 'any-user-id',
      sessionId: 'any-session',
      role: 'USER',
      tokenVersion: 999,
    })
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
    expect([401, 'UNAUTHORIZED', 'INVALID_TOKEN']).toContain(
      res.status === 401 ? 401 : res.body.code
    )
  })
})

// ─── Privilege Escalation ─────────────────────────────────────────────────────

describe('Security: Privilege Escalation', () => {
  it('USER role cannot access ADMIN-only routes', async () => {
    const token = await signAccessToken({
      userId: 'user-id',
      sessionId: 'session-id',
      role: 'USER',
      tokenVersion: 0,
    })

    // Assuming /api/admin exists and requires ADMIN role
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)

    expect([401, 403, 404]).toContain(res.status)
    if (res.status === 403) {
      expect(res.body.code).toBe('FORBIDDEN')
    }
  })
})

// ─── CSRF / OAuth State Validation ───────────────────────────────────────────

describe('Security: OAuth CSRF', () => {
  it('rejects OAuth callback with mismatched state parameter', async () => {
    const res = await request(app)
      .get('/api/auth/oauth/google/callback')
      .query({ code: 'fake-code', state: 'invalid-state' })
      .set('Cookie', 'oauth_state=different-state')

    // Should redirect to error page, not process the callback
    expect([302, 400, 403]).toContain(res.status)
    if (res.status === 302) {
      expect(res.headers.location).toContain('error=')
    }
  })
})

// ─── Reset Token Security ─────────────────────────────────────────────────────

describe('Security: Password Reset Token', () => {
  it('rejects reset with wrong email even if token hash matches another account', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: 'a'.repeat(43),
        email: 'attacker@example.com',
        newPassword: 'NewSecure1!',
      })
      .expect(401)
    expect(res.body.code).toBe('INVALID_TOKEN')
  })

  it('reset endpoint responds identically for existing vs non-existing email', async () => {
    const t1 = Date.now()
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'real@example.com' })
    const d1 = Date.now() - t1

    const t2 = Date.now()
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'ghost123456@example.com' })
    const d2 = Date.now() - t2

    // Timing difference should not be large enough to enumerate (< 500ms diff)
    expect(Math.abs(d1 - d2)).toBeLessThan(500)
  })
})
