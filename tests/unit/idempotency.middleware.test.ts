import type { Request, Response, NextFunction } from 'express'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../src/modules/redis/redis.client', () => ({
  redisGet: jest.fn(),
  redisSet: jest.fn().mockResolvedValue(undefined),
}))

import { idempotencyGuard } from '../../src/middleware/idempotency.middleware'
import { redisGet, redisSet } from '../../src/modules/redis/redis.client'
import { ValidationError } from '../../src/common/errors'

const mockRedisGet = redisGet as jest.MockedFunction<typeof redisGet>
const mockRedisSet = redisSet as jest.MockedFunction<typeof redisSet>

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    auth:    { sub: 'user-1', role: 'USER', sid: 's1', ver: 1, iat: 0, exp: 9999999999, iss: 'artsony', aud: 'artsony' },
    headers: { 'idempotency-key': 'a0000000-0000-0000-0000-000000000001' },
    ...overrides,
  } as unknown as Request
}

function makeRes(): {
  res: Response
  json: jest.Mock
  status: jest.Mock
  setHeader: jest.Mock
  getHeader: jest.Mock
  statusCode: number
} {
  const jsonMock      = jest.fn().mockReturnThis()
  const statusMock    = jest.fn().mockReturnThis()
  const setHeaderMock = jest.fn()
  const getHeaderMock = jest.fn().mockReturnValue('application/json')

  const res = {
    json:       jsonMock,
    status:     statusMock,
    setHeader:  setHeaderMock,
    getHeader:  getHeaderMock,
    statusCode: 201,
  } as unknown as Response

  return { res, json: jsonMock, status: statusMock, setHeader: setHeaderMock, getHeader: getHeaderMock, statusCode: 201 }
}

const next: NextFunction = jest.fn()

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockRedisGet.mockResolvedValue(null)
})

// ═════════════════════════════════════════════════════════════════════════════
// Cache hit — replay
// ═════════════════════════════════════════════════════════════════════════════

describe('idempotencyGuard — cache hit', () => {
  it('replays the stored response without calling next', async () => {
    const stored = { status: 201, body: { success: true, data: { id: 'order-1' } }, headers: { 'Content-Type': 'application/json' } }
    mockRedisGet.mockResolvedValue(JSON.stringify(stored))

    const { res, json, status } = makeRes()
    const middleware = idempotencyGuard()

    await middleware(makeReq(), res, next)

    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(201)
    expect(json).toHaveBeenCalledWith(stored.body)
  })

  it('sets Idempotent-Replayed header on cache hit', async () => {
    const stored = { status: 201, body: { success: true }, headers: { 'Content-Type': 'application/json' } }
    mockRedisGet.mockResolvedValue(JSON.stringify(stored))

    const { res, setHeader } = makeRes()
    const middleware = idempotencyGuard()

    await middleware(makeReq(), res, next)

    expect(setHeader).toHaveBeenCalledWith('Idempotent-Replayed', 'true')
  })

  it('re-attaches stored response headers on replay', async () => {
    const stored = { status: 200, body: {}, headers: { 'Content-Type': 'application/json' } }
    mockRedisGet.mockResolvedValue(JSON.stringify(stored))

    const { res, setHeader } = makeRes()
    await idempotencyGuard()(makeReq(), res, next)

    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/json')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Cache miss — intercept and store
// ═════════════════════════════════════════════════════════════════════════════

describe('idempotencyGuard — cache miss', () => {
  it('calls next() on cache miss', async () => {
    const { res } = makeRes()
    await idempotencyGuard()(makeReq(), res, next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('intercepts the response and stores it in Redis on 2xx', async () => {
    const { res } = makeRes()
    await idempotencyGuard()(makeReq(), res, next)

    // Simulate the handler calling res.json
    const responseBody = { success: true, data: { id: 'order-1' } }
    ;(res as any).statusCode = 201
    res.json(responseBody)

    // Give the fire-and-forget a tick to execute
    await new Promise(r => setImmediate(r))

    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringContaining('user-1'),
      expect.stringContaining('order-1'),
      60 * 60 * 24,
    )
  })

  it('does not store in Redis for non-2xx responses', async () => {
    const { res } = makeRes()
    await idempotencyGuard()(makeReq(), res, next)

    ;(res as any).statusCode = 422
    res.json({ success: false, code: 'VALIDATION_ERROR' })

    await new Promise(r => setImmediate(r))

    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it('does not store in Redis for 5xx responses', async () => {
    const { res } = makeRes()
    await idempotencyGuard()(makeReq(), res, next)

    ;(res as any).statusCode = 500
    res.json({ success: false, code: 'INTERNAL_ERROR' })

    await new Promise(r => setImmediate(r))

    expect(mockRedisSet).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Validation
// ═════════════════════════════════════════════════════════════════════════════

describe('idempotencyGuard — validation', () => {
  it('calls next with ValidationError for non-UUID idempotency key', async () => {
    const req = makeReq({ headers: { 'idempotency-key': 'not-a-uuid' } })
    const { res } = makeRes()

    await idempotencyGuard()(req, res, next)

    expect(next).toHaveBeenCalledWith(expect.any(ValidationError))
  })

  it('passes through when no Idempotency-Key header is present', async () => {
    const req = makeReq({ headers: {} })
    const { res } = makeRes()

    await idempotencyGuard()(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith()   // called with no error
  })

  it('passes through when req.auth is not set (pre-auth route)', async () => {
    const req = makeReq({ auth: undefined } as any)
    const { res } = makeRes()

    await idempotencyGuard()(req, res, next)

    expect(next).toHaveBeenCalledWith()
    expect(mockRedisGet).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// User scoping
// ═════════════════════════════════════════════════════════════════════════════

describe('idempotencyGuard — user scoping', () => {
  it('uses different cache keys for different users with the same idempotency key', async () => {
    const idemKey = 'b0000000-0000-0000-0000-000000000001'

    const req1 = makeReq({
      auth:    { sub: 'user-1', role: 'USER', sid: 's1', ver: 1, iat: 0, exp: 9999, iss: 'a', aud: 'a' } as any,
      headers: { 'idempotency-key': idemKey },
    })
    const req2 = makeReq({
      auth:    { sub: 'user-2', role: 'USER', sid: 's2', ver: 1, iat: 0, exp: 9999, iss: 'a', aud: 'a' } as any,
      headers: { 'idempotency-key': idemKey },
    })

    const { res: res1 } = makeRes()
    const { res: res2 } = makeRes()

    await idempotencyGuard()(req1, res1, next)
    await idempotencyGuard()(req2, res2, next)

    const calls = mockRedisGet.mock.calls.map(c => c[0] as string)
    expect(calls[0]).not.toBe(calls[1])
    expect(calls[0]).toContain('user-1')
    expect(calls[1]).toContain('user-2')
  })

  it('same user + same key hits the cache on second call', async () => {
    const idemKey = 'c0000000-0000-0000-0000-000000000001'
    const stored  = { status: 201, body: { success: true }, headers: { 'Content-Type': 'application/json' } }

    // First call — cache miss
    mockRedisGet.mockResolvedValueOnce(null)
    const { res: res1 } = makeRes()
    await idempotencyGuard()(makeReq({ headers: { 'idempotency-key': idemKey } }), res1, next)

    // Second call — cache hit
    mockRedisGet.mockResolvedValueOnce(JSON.stringify(stored))
    const { res: res2 } = makeRes()
    await idempotencyGuard()(makeReq({ headers: { 'idempotency-key': idemKey } }), res2, next)

    // next was only called once (on the first call)
    expect(next).toHaveBeenCalledTimes(1)
  })
})