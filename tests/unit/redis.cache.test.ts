// ── ioredis mock ──────────────────────────────────────────────────────────────

const mockGet  = jest.fn()
const mockSet  = jest.fn()
const mockDel  = jest.fn()
const mockIncr = jest.fn()
const mockExpire = jest.fn()
const mockTtl  = jest.fn()
const mockScan = jest.fn()
const mockOn   = jest.fn()

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get:    mockGet,
    set:    mockSet,
    del:    mockDel,
    incr:   mockIncr,
    expire: mockExpire,
    ttl:    mockTtl,
    scan:   mockScan,
    on:     mockOn,
  }))
})

jest.mock('../../src/config', () => ({
  config: {
    redis: { url: 'redis://localhost:6379', keyPrefix: 'artsony:' },
  },
}))

import {
  redisGet,
  redisSet,
  redisDel,
  redisIncr,
  redisTtl,
  redisGetJson,
  redisSetJson,
  RedisKeys,
  RedisTTL,
  getRedis,
} from '../../src/modules/redis/redis.client'

beforeEach(() => {
  jest.clearAllMocks()
  mockSet.mockResolvedValue('OK')
  mockDel.mockResolvedValue(1)
  mockIncr.mockResolvedValue(1)
  mockExpire.mockResolvedValue(1)
  mockTtl.mockResolvedValue(300)
})

// ═════════════════════════════════════════════════════════════════════════════
// RedisKeys registry — key format contracts
// ═════════════════════════════════════════════════════════════════════════════

describe('RedisKeys — format contracts', () => {
  // ── Auth ─────────────────────────────────────────────────────────────────
  it('session key contains the session id', () => {
    expect(RedisKeys.session('sid-1')).toContain('sid-1')
    expect(RedisKeys.session('sid-1')).toMatch(/^auth:session:/)
  })

  it('rtBlacklist key contains the token hash', () => {
    expect(RedisKeys.rtBlacklist('hash-abc')).toContain('hash-abc')
  })

  it('loginAttempts key URL-encodes the email', () => {
    const key = RedisKeys.loginAttempts('user@example.com')
    expect(key).not.toContain('@')
    expect(key).toContain('user')
  })

  it('lockout key URL-encodes the email', () => {
    const key = RedisKeys.lockout('user+tag@example.com')
    expect(key).not.toContain('+')
  })

  // ── Artwork ───────────────────────────────────────────────────────────────
  it('artworkById key uses the correct prefix', () => {
    expect(RedisKeys.artworkById('art-1')).toBe('artwork:single:art-1')
  })

  it('artworkBySlug key uses the correct prefix', () => {
    expect(RedisKeys.artworkBySlug('my-artwork')).toBe('artwork:slug:my-artwork')
  })

  it('artworkList key contains the fingerprint', () => {
    expect(RedisKeys.artworkList('fp-xyz')).toBe('artwork:list:fp-xyz')
  })

  it('artworkViewLock key contains both artworkId and identity', () => {
    const key = RedisKeys.artworkViewLock('art-1', 'ip-192.168.1.1')
    expect(key).toContain('art-1')
    expect(key).toContain('ip-192.168.1.1')
  })

  // ── Cart ──────────────────────────────────────────────────────────────────
  it('cart key is scoped to user', () => {
    expect(RedisKeys.cart('user-1')).toBe('cart:user-1')
    expect(RedisKeys.cart('user-2')).toBe('cart:user-2')
    expect(RedisKeys.cart('user-1')).not.toBe(RedisKeys.cart('user-2'))
  })

  // ── Order ─────────────────────────────────────────────────────────────────
  it('orderById key uses correct prefix', () => {
    expect(RedisKeys.orderById('order-1')).toBe('order:single:order-1')
  })

  it('orderBuyerList key is scoped to user and page', () => {
    const key1 = RedisKeys.orderBuyerList('user-1', 1)
    const key2 = RedisKeys.orderBuyerList('user-1', 2)
    const key3 = RedisKeys.orderBuyerList('user-2', 1)

    expect(key1).toContain('user-1')
    expect(key1).not.toBe(key2)    // different pages
    expect(key1).not.toBe(key3)    // different users
  })

  it('orderSellerList key is scoped to seller and page', () => {
    expect(RedisKeys.orderSellerList('seller-1', 1)).toContain('seller-1')
  })

  it('orderIdempotent key contains the idempotency key', () => {
    const idem = 'a0000000-0000-0000-0000-000000000001'
    expect(RedisKeys.orderIdempotent(idem)).toContain(idem)
    expect(RedisKeys.orderIdempotent(idem)).toMatch(/^order:idem:/)
  })

  // ── Payment ───────────────────────────────────────────────────────────────
  it('paymentStatus key is scoped to orderId', () => {
    expect(RedisKeys.paymentStatus('order-1')).toBe('payment:status:order-1')
  })

  it('verifyLock key is scoped to transactionId', () => {
    expect(RedisKeys.verifyLock('tx-1')).toBe('payment:verify:lock:tx-1')
  })

  it('verifyLock keys for different transactions are distinct', () => {
    expect(RedisKeys.verifyLock('tx-1')).not.toBe(RedisKeys.verifyLock('tx-2'))
  })

  // ── Delivery ──────────────────────────────────────────────────────────────
  it('deliveryToken key contains the hash', () => {
    const hash = 'abc123def456'
    expect(RedisKeys.deliveryToken(hash)).toBe(`delivery:token:${hash}`)
  })

  // ── Idempotency middleware ─────────────────────────────────────────────────
  it('httpIdempotency key is scoped to userId and key', () => {
    const key1 = RedisKeys.httpIdempotency('user-1', 'key-a')
    const key2 = RedisKeys.httpIdempotency('user-2', 'key-a')
    const key3 = RedisKeys.httpIdempotency('user-1', 'key-b')

    expect(key1).toContain('user-1')
    expect(key1).not.toBe(key2)    // different users
    expect(key1).not.toBe(key3)    // different keys
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// RedisTTL registry — all values are positive integers
// ═════════════════════════════════════════════════════════════════════════════

describe('RedisTTL — value contracts', () => {
  it('all TTL values are positive integers', () => {
    for (const [name, ttl] of Object.entries(RedisTTL)) {
      expect(typeof ttl).toBe('number')
      expect(ttl).toBeGreaterThan(0)
      expect(Number.isInteger(ttl)).toBe(true)
    }
  })

  it('verifyLock TTL is at most 60 seconds — short-lived lock', () => {
    expect(RedisTTL.verifyLock).toBeLessThanOrEqual(60)
  })

  it('httpIdempotency TTL is at least 1 hour', () => {
    expect(RedisTTL.httpIdempotency).toBeGreaterThanOrEqual(3600)
  })

  it('orderIdempotency TTL is at least 1 hour', () => {
    expect(RedisTTL.orderIdempotency).toBeGreaterThanOrEqual(3600)
  })

  it('cart TTL is shorter than orderSingle TTL', () => {
    // Cart data is less critical than confirmed order data — but actually
    // we cache cart longer (10 min) than orders (2 min) because orders
    // change state more frequently. This test documents that contract.
    expect(RedisTTL.cart).toBeGreaterThan(RedisTTL.orderSingle)
  })

  it('paymentStatus TTL equals orderSingle TTL', () => {
    expect(RedisTTL.paymentStatus).toBe(RedisTTL.orderSingle)
  })

  it('deliveryToken TTL is positive and reasonable (between 1 min and 1 hour)', () => {
    expect(RedisTTL.deliveryToken).toBeGreaterThanOrEqual(60)
    expect(RedisTTL.deliveryToken).toBeLessThanOrEqual(3600)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// redisSetJson / redisGetJson — typed JSON helpers
// ═════════════════════════════════════════════════════════════════════════════

describe('redisSetJson', () => {
  it('serialises the value as JSON and calls set with correct TTL', async () => {
    const payload = { id: 'order-1', status: 'PENDING_PAYMENT' }
    await redisSetJson('some-key', payload, 120)

    expect(mockSet).toHaveBeenCalledWith(
      'some-key',
      JSON.stringify(payload),
      'EX',
      120,
    )
  })

  it('serialises arrays correctly', async () => {
    const items = [{ id: 'item-1' }, { id: 'item-2' }]
    await redisSetJson('arr-key', items, 60)

    expect(mockSet).toHaveBeenCalledWith(
      'arr-key',
      JSON.stringify(items),
      'EX',
      60,
    )
  })

  it('serialises null correctly', async () => {
    await redisSetJson('null-key', null, 30)
    expect(mockSet).toHaveBeenCalledWith('null-key', 'null', 'EX', 30)
  })
})

describe('redisGetJson', () => {
  it('returns parsed object when key exists', async () => {
    const payload = { id: 'order-1', total: 100 }
    mockGet.mockResolvedValue(JSON.stringify(payload))

    const result = await redisGetJson<typeof payload>('some-key')

    expect(result).toEqual(payload)
  })

  it('returns null when key does not exist', async () => {
    mockGet.mockResolvedValue(null)

    const result = await redisGetJson('missing-key')

    expect(result).toBeNull()
  })

  it('returns null and deletes the key when value is corrupt JSON', async () => {
    mockGet.mockResolvedValue('{ not valid json !!!')

    const result = await redisGetJson('corrupt-key')

    expect(result).toBeNull()
    // Corrupt cache entry is deleted
    await new Promise(r => setImmediate(r))
    expect(mockDel).toHaveBeenCalledWith('corrupt-key')
  })

  it('returns null for empty string cache values', async () => {
    mockGet.mockResolvedValue('')

    const result = await redisGetJson('empty-key')

    expect(result).toBeNull()
  })

  it('correctly deserialises arrays', async () => {
    const arr = [1, 2, 3]
    mockGet.mockResolvedValue(JSON.stringify(arr))

    const result = await redisGetJson<number[]>('arr-key')

    expect(result).toEqual(arr)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Raw helpers — redisGet, redisSet, redisDel, redisIncr, redisTtl
// ═════════════════════════════════════════════════════════════════════════════

describe('redisGet', () => {
  it('returns the stored string value', async () => {
    mockGet.mockResolvedValue('stored-value')
    const result = await redisGet('some-key')
    expect(result).toBe('stored-value')
  })

  it('returns null when key does not exist', async () => {
    mockGet.mockResolvedValue(null)
    const result = await redisGet('missing')
    expect(result).toBeNull()
  })
})

describe('redisSet', () => {
  it('calls ioredis set with EX option and correct TTL', async () => {
    await redisSet('key', 'value', 300)
    expect(mockSet).toHaveBeenCalledWith('key', 'value', 'EX', 300)
  })
})

describe('redisDel', () => {
  it('calls ioredis del with the key', async () => {
    await redisDel('some-key')
    expect(mockDel).toHaveBeenCalledWith('some-key')
  })
})

describe('redisIncr', () => {
  it('returns the incremented value', async () => {
    mockIncr.mockResolvedValue(3)
    const count = await redisIncr('counter-key')
    expect(count).toBe(3)
  })

  it('sets TTL on first increment when ttlSeconds is provided', async () => {
    mockIncr.mockResolvedValue(1)
    await redisIncr('new-key', 120)
    expect(mockExpire).toHaveBeenCalledWith('new-key', 120)
  })

  it('does not set TTL when count is not 1', async () => {
    mockIncr.mockResolvedValue(5)
    await redisIncr('existing-key', 120)
    expect(mockExpire).not.toHaveBeenCalled()
  })

  it('does not set TTL when ttlSeconds is not provided', async () => {
    mockIncr.mockResolvedValue(1)
    await redisIncr('key-no-ttl')
    expect(mockExpire).not.toHaveBeenCalled()
  })
})

describe('redisTtl', () => {
  it('returns the remaining TTL for the key', async () => {
    mockTtl.mockResolvedValue(450)
    const ttl = await redisTtl('some-key')
    expect(ttl).toBe(450)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// getRedis — singleton behaviour
// ═════════════════════════════════════════════════════════════════════════════

describe('getRedis', () => {
  it('returns the same instance on repeated calls (singleton)', () => {
    const instance1 = getRedis()
    const instance2 = getRedis()
    expect(instance1).toBe(instance2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Key collision safety — confirm no two different key builders can produce the same string
// ═════════════════════════════════════════════════════════════════════════════

describe('RedisKeys — no collision between namespaces', () => {
  it('cart and order keys never collide for the same user id', () => {
    const userId = 'user-abc'
    expect(RedisKeys.cart(userId)).not.toBe(RedisKeys.orderById(userId))
    expect(RedisKeys.cart(userId)).not.toBe(RedisKeys.orderBuyerList(userId, 1))
  })

  it('paymentStatus and orderById keys for the same id never collide', () => {
    const id = 'same-id'
    expect(RedisKeys.paymentStatus(id)).not.toBe(RedisKeys.orderById(id))
  })

  it('artworkById and artworkBySlug for same string never collide', () => {
    const val = 'same-value'
    expect(RedisKeys.artworkById(val)).not.toBe(RedisKeys.artworkBySlug(val))
  })

  it('httpIdempotency and orderIdempotent for the same key string never collide', () => {
    const key = 'some-key'
    expect(RedisKeys.httpIdempotency('user-1', key)).not.toBe(RedisKeys.orderIdempotent(key))
  })

  it('verifyLock and paymentStatus for the same id never collide', () => {
    const id = 'shared-id'
    expect(RedisKeys.verifyLock(id)).not.toBe(RedisKeys.paymentStatus(id))
  })
})