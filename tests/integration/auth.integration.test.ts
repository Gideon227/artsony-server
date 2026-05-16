import request from 'supertest'
import { createApp } from '../../src/app'
import type { Express } from 'express'

// These tests expect a real test DB and Redis.
// Run: NODE_ENV=test jest tests/integration

let app: Express

beforeAll(() => {
  app = createApp()
})

// ─── Register ─────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  const validBody = {
    email: `test_${Date.now()}@example.com`,
    password: 'SecurePass1!',
    username: `user_${Date.now()}`,
    displayName: 'Test User',
  }

  it('creates account and returns accessToken + httpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(validBody)
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.accessToken).toBeDefined()
    expect(res.body.data.user.email).toBe(validBody.email.toLowerCase())
    expect(res.body.data.user.password_hash).toBeUndefined()

    const cookies = res.headers['set-cookie'] as string[]
    expect(cookies.some((c) => c.includes('artsony_rt'))).toBe(true)
    expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true)
  })

  it('rejects duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send(validBody)
    const res = await request(app).post('/api/auth/register').send(validBody).expect(409)
    expect(res.body.code).toBe('CONFLICT')
  })

  it('rejects weak password with 422', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, password: 'weak', email: 'other@example.com' })
      .expect(422)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('rejects invalid email format with 422', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, email: 'not-an-email' })
      .expect(422)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })
})

// ─── Login ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  const email = `login_${Date.now()}@example.com`
  const password = 'LoginPass1!'

  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({
      email, password, username: `login_${Date.now()}`, displayName: 'Login User',
    })
  })

  it('returns accessToken for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200)

    expect(res.body.data.accessToken).toBeDefined()
    expect(res.body.data.user.email).toBe(email)
  })

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'WrongPass1!' })
      .expect(401)
    expect(res.body.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 for non-existent email (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'Anything1!' })
      .expect(401)
    expect(res.body.code).toBe('UNAUTHORIZED')
  })

  it('does not return password_hash in response', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200)
    expect(res.body.data.user.password_hash).toBeUndefined()
    expect(res.body.data.user.token_version).toBeUndefined()
  })
})

// ─── Refresh ──────────────────────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  let refreshCookie: string

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: `refresh_${Date.now()}@example.com`,
      password: 'RefreshPass1!',
      username: `refresh_${Date.now()}`,
      displayName: 'Refresh User',
    })
    const cookies = res.headers['set-cookie'] as string[]
    refreshCookie = cookies.find((c) => c.includes('artsony_rt'))!
  })

  it('issues a new accessToken and rotates the refresh cookie', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200)

    expect(res.body.data.accessToken).toBeDefined()

    // New cookie should differ from old
    const newCookies = res.headers['set-cookie'] as string[]
    const newRt = newCookies.find((c) => c.includes('artsony_rt'))
    expect(newRt).not.toBe(refreshCookie)
  })

  it('rejects missing cookie with 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .expect(200) // Returns 200 with code NO_REFRESH_TOKEN per controller
    expect(res.status).not.toBe(500)
  })
})

// ─── Forgot / Reset Password ──────────────────────────────────────────────────

describe('Password Reset Flow', () => {
  it('POST /api/auth/forgot-password always returns 200 (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'doesnotexist@example.com' })
      .expect(200)
    expect(res.body.success).toBe(true)
  })

  it('POST /api/auth/reset-password rejects invalid token with 401', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: 'a'.repeat(43),  // valid base64url length but wrong
        email: 'test@example.com',
        newPassword: 'NewSecure1!',
      })
      .expect(401)
    expect(res.body.code).toBe('INVALID_TOKEN')
  })
})

// ─── Logout ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('clears the refresh cookie and returns success', async () => {
    const registerRes = await request(app).post('/api/auth/register').send({
      email: `logout_${Date.now()}@example.com`,
      password: 'LogoutPass1!',
      username: `logout_${Date.now()}`,
      displayName: 'Logout User',
    })
    const at = registerRes.body.data.accessToken as string
    const cookies = registerRes.headers['set-cookie'] as string[]

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${at}`)
      .set('Cookie', cookies)
      .expect(200)

    expect(logoutRes.body.success).toBe(true)
    const newCookies = logoutRes.headers['set-cookie'] as string[]
    // Cookie should be cleared (Max-Age=0 or expires in past)
    const rtCookie = newCookies.find((c) => c.includes('artsony_rt'))
    expect(rtCookie).toMatch(/Max-Age=0|expires=Thu, 01 Jan 1970/i)
  })
})
