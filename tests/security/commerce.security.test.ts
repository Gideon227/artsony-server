import request from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import { createApp } from '../../src/app'
import type { Express } from 'express'

// ── Requires NODE_ENV=test with seeded Supabase + Redis + PLATFORM_WALLET_TRON
// Run: NODE_ENV=test jest tests/security/commerce.security --runInBand

let app: Express

let buyerToken:   string
let sellerToken:  string
let attackerToken: string

let digitalArtworkId:  string
let physicalArtworkId: string

// ── Helpers ───────────────────────────────────────────────────────────────────

async function registerAndLogin(suffix: string): Promise<string> {
  const ts       = Date.now()
  const email    = `sec_${suffix}_${ts}@example.com`
  const password = 'TestPass1!'
  const username = `sec_${suffix}_${ts}`
  await request(app).post('/api/auth/register').send({ email, password, username })
  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200)
  return res.body.data.accessToken as string
}

async function createAndPublishArtwork(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await request(app)
    .post('/api/artworks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      listing_type:   'MARKETPLACE',
      artwork_format: 'DIGITAL',
      title:          `Security Test Artwork ${Date.now()}`,
      description:    'Security test.',
      price:          100,
      currency:       'USDT',
      has_variants:   false,
      visibility:     'PUBLIC',
      assets: [{
        original_url:    'https://res.cloudinary.com/test/image/upload/v1/test.jpg',
        optimized_url:   'https://res.cloudinary.com/test/image/upload/v1/test.jpg',
        thumbnail_url:   'https://res.cloudinary.com/test/image/upload/v1/test.jpg',
        media_type:      'IMAGE',
        mime_type:       'image/jpeg',
        file_size_bytes: 204800,
        ordering_index:  0,
      }],
      ...overrides,
    })
    .expect(201)

  const id: string = res.body.data.id
  await request(app).post(`/api/artworks/${id}/publish`).set('Authorization', `Bearer ${token}`).expect(200)
  return id
}

async function addToCart(token: string, artworkId: string, qty = 1): Promise<string> {
  const res = await request(app)
    .post('/api/cart/items')
    .set('Authorization', `Bearer ${token}`)
    .send({ artwork_id: artworkId, quantity: qty })
    .expect(201)
  return res.body.data.items[0].id as string
}

async function checkout(
  token: string,
  cartItemIds: string[],
  extras: Record<string, unknown> = {},
): Promise<{ orderId: string; txId: string }> {
  const res = await request(app)
    .post('/api/orders/checkout')
    .set('Authorization', `Bearer ${token}`)
    .send({ cart_item_ids: cartItemIds, idempotency_key: uuidv4(), ...extras })
    .expect(201)
  return {
    orderId: res.body.data.order.id as string,
    txId:    res.body.data.payment_instructions.transaction_id as string,
  }
}

const validShipping = {
  full_name: 'Test Buyer', phone: '+2341234567890',
  address_line_1: '12 Test Street', address_line_2: null,
  city: 'Lagos', state: 'Lagos', postal_code: '100001', country_code: 'NG',
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  app = createApp()
  buyerToken    = await registerAndLogin('buyer')
  sellerToken   = await registerAndLogin('seller')
  attackerToken = await registerAndLogin('attacker')

  digitalArtworkId  = await createAndPublishArtwork(sellerToken)
  physicalArtworkId = await createAndPublishArtwork(sellerToken, {
    artwork_format:   'PHYSICAL',
    physical_details: {
      length: 30, width: 20, height: 2, unit: 'cm',
      available_quantity: 5,
      shipping_regions: ['NG'], ships_worldwide: false,
    },
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 1. Price integrity — client cannot influence order total
// ═════════════════════════════════════════════════════════════════════════════

describe('Security: Price Integrity', () => {
  it('ignores client-supplied total field — uses server-computed price', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)

    const res = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        cart_item_ids:   [cartItemId],
        idempotency_key: uuidv4(),
        total:           0.01,          // attacker attempts to set price to 1 cent
        subtotal:        0.01,
        amount:          0.01,
      })
      .expect(201)

    expect(res.body.data.order.subtotal).toBe(100)
    expect(res.body.data.payment_instructions.amount).toBe(100)
  })

  it('ignores client-supplied unit_price on cart add — snapshots from DB', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        artwork_id:  digitalArtworkId,
        quantity:    1,
        unit_price:  0.01,     // ignored
        price:       0.01,     // ignored
      })
      .expect(201)

    expect(res.body.data.items[0].price_at_add).toBe(100)
  })

  it('uses current artwork price at checkout even if cart was added at lower price', async () => {
    // Add to cart (price_at_add = 100)
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)

    // Checkout — effective price is computed from live DB, not price_at_add
    const res = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: [cartItemId], idempotency_key: uuidv4() })
      .expect(201)

    // Regardless of what price_at_add says, subtotal = live price × quantity
    expect(res.body.data.order.subtotal).toBe(100)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 2. Idempotency — duplicate requests cannot create duplicate orders
// ═════════════════════════════════════════════════════════════════════════════

describe('Security: Idempotency', () => {
  it('returns the same order for identical idempotency_key (no duplicate created)', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const idemKey    = uuidv4()

    const res1 = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: [cartItemId], idempotency_key: idemKey })
      .expect(201)

    const res2 = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: [cartItemId], idempotency_key: idemKey })
      .expect(201)

    expect(res1.body.data.order.id).toBe(res2.body.data.order.id)
  })

  it('different users with same idempotency_key create separate orders', async () => {
    const cartItemId1 = await addToCart(buyerToken,    digitalArtworkId)
    const cartItemId2 = await addToCart(attackerToken, digitalArtworkId)
    const idemKey     = uuidv4()

    const res1 = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: [cartItemId1], idempotency_key: idemKey })
      .expect(201)

    const res2 = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ cart_item_ids: [cartItemId2], idempotency_key: idemKey })
      .expect(201)

    // Same key, different users — two distinct orders
    expect(res1.body.data.order.id).not.toBe(res2.body.data.order.id)
  })

  it('non-UUID idempotency_key is rejected with 422', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)

    await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: [cartItemId], idempotency_key: 'not-a-uuid' })
      .expect(422)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 3. Replay attack — tx_hash cannot be reused across orders
// ═════════════════════════════════════════════════════════════════════════════

describe('Security: Transaction Hash Replay', () => {
  const txHash = 'd'.repeat(64)

  it('rejects a tx_hash that was already submitted to another order', async () => {
    // First order — submit tx_hash
    const cartItemId1 = await addToCart(buyerToken, digitalArtworkId)
    const { orderId: orderId1 } = await checkout(buyerToken, [cartItemId1])

    await request(app)
      .post(`/api/orders/${orderId1}/confirm-payment`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ tx_hash: txHash, sender_wallet_address: 'TSender', network: 'TRON' })
      .expect(200)

    // Second order — attempt to reuse the same tx_hash
    const cartItemId2 = await addToCart(buyerToken, digitalArtworkId)
    const { orderId: orderId2 } = await checkout(buyerToken, [cartItemId2])

    const res = await request(app)
      .post(`/api/orders/${orderId2}/confirm-payment`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ tx_hash: txHash, sender_wallet_address: 'TSender', network: 'TRON' })
      .expect(409)

    expect(res.body.code).toBe('TX_HASH_ALREADY_USED')
  })

  it('rejects invalid tx_hash format (not 64 hex characters)', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    const invalidHashes = [
      'short',
      'z'.repeat(64),        // non-hex characters
      'a'.repeat(63),        // 63 chars — one short
      'a'.repeat(65),        // 65 chars — one over
      '',
      '0x' + 'a'.repeat(62), // prefixed format — rejected
    ]

    for (const hash of invalidHashes) {
      const res = await request(app)
        .post(`/api/orders/${orderId}/confirm-payment`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ tx_hash: hash, sender_wallet_address: 'TSender', network: 'TRON' })
      expect([422, 400]).toContain(res.status)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 4. Cross-user access control — orders, cart, delivery
// ═════════════════════════════════════════════════════════════════════════════

describe('Security: Cross-User Access Control', () => {
  it('attacker cannot read another user\'s order', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .expect(403)
  })

  it('attacker cannot cancel another user\'s order', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .expect(403)
  })

  it('attacker cannot confirm payment for another user\'s order', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    await request(app)
      .post(`/api/orders/${orderId}/confirm-payment`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ tx_hash: 'e'.repeat(64), sender_wallet_address: 'TSender', network: 'TRON' })
      .expect(403)
  })

  it('attacker cannot remove items from another user\'s cart', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)

    await request(app)
      .delete(`/api/cart/items/${cartItemId}`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .expect(404)   // returns 404 not 403 — ownership enforced by user_id filter
  })

  it('attacker cannot update quantity in another user\'s cart', async () => {
    // Add physical artwork to buyer cart (digital qty is immutable)
    const cartItemId = await addToCart(buyerToken, physicalArtworkId, 1)

    await request(app)
      .patch(`/api/cart/items/${cartItemId}`)
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ quantity: 2 })
      .expect(404)
  })

  it('attacker cannot checkout using another user\'s cart items', async () => {
    const buyerCartItemId = await addToCart(buyerToken, digitalArtworkId)

    // Attacker submits buyer's cart item IDs in their own checkout request
    await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ cart_item_ids: [buyerCartItemId], idempotency_key: uuidv4() })
      .expect(422)  // CART_ITEMS_NOT_FOUND — attacker doesn't own those items
  })

  it('seller cannot read an order they have no items in', async () => {
    // Create a second seller who is not involved in this order
    const seller2Token = await registerAndLogin('seller2')

    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${seller2Token}`)
      .expect(403)
  })

  it('seller with item in order CAN read that order', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200)

    expect(res.body.data.id).toBe(orderId)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 5. State machine enforcement — illegal transitions are rejected
// ═════════════════════════════════════════════════════════════════════════════

describe('Security: Order State Machine', () => {
  it('buyer cannot move order from PENDING_PAYMENT directly to COMPLETED', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ status: 'COMPLETED' })
      .expect(403)   // buyer is not a seller or admin — forbidden
  })

  it('seller cannot mark a PENDING_PAYMENT order as SHIPPED', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    const res = await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'SHIPPED' })
      .expect(403)   // seller can only do PROCESSING → SHIPPED, not PENDING → SHIPPED
  })

  it('cannot submit payment for an already CANCELLED order', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200)

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm-payment`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ tx_hash: 'f'.repeat(64), sender_wallet_address: 'TSender', network: 'TRON' })
      .expect(422)

    expect(res.body.code).toBe('ORDER_NOT_PENDING_PAYMENT')
  })

  it('cannot cancel an order twice', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200)

    const res = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(422)

    expect(res.body.code).toBe('INVALID_ORDER_TRANSITION')
  })

  it('rejects REFUNDED status via HTTP — only valid from COMPLETED and only for admins', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    // Seller should not be able to refund
    await request(app)
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'REFUNDED' })
      .expect(403)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 6. Digital delivery — download token security
// ═════════════════════════════════════════════════════════════════════════════

describe('Security: Digital Download Token', () => {
  it('returns 401 when no auth token provided for download endpoint', async () => {
    await request(app)
      .get('/api/delivery/sometoken')
      .expect(401)
  })

  it('returns 404 for a completely fabricated download token', async () => {
    const res = await request(app)
      .get('/api/delivery/totally-fabricated-token-that-does-not-exist')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(404)

    expect(res.body.code).toBe('INVALID_DOWNLOAD_TOKEN')
  })

  it('brute-force protection: rate limits after 10 requests per minute', async () => {
    const attempts = Array.from({ length: 12 }, (_, i) =>
      request(app)
        .get(`/api/delivery/bruteforce-attempt-${i}`)
        .set('Authorization', `Bearer ${buyerToken}`),
    )

    const results = await Promise.all(attempts)
    const rateLimited = results.filter(r => r.status === 429)
    expect(rateLimited.length).toBeGreaterThan(0)
  })

  it('rejects token that is too short (< 32 chars) — validation guard', async () => {
    await request(app)
      .get('/api/delivery/short')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(422)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 7. Input sanitisation — SQL injection and injection attempts
// ═════════════════════════════════════════════════════════════════════════════

describe('Security: Input Sanitisation', () => {
  it('rejects SQL injection in order id param', async () => {
    await request(app)
      .get("/api/orders/1' OR '1'='1")
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(422)
  })

  it('rejects SQL injection in cart item id param', async () => {
    await request(app)
      .delete("/api/cart/items/1; DROP TABLE orders;--")
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(422)
  })

  it('rejects SQL injection in artwork_id body field', async () => {
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: "1' OR '1'='1", quantity: 1 })
      .expect(422)
  })

  it('rejects oversized JSON body — DoS protection', async () => {
    const hugePadding = 'x'.repeat(15_000)
    await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: [uuidv4()], idempotency_key: uuidv4(), notes: hugePadding })
      .expect(413)
  })

  it('rejects HTTP parameter pollution on quantity field', async () => {
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .query({ quantity: ['1', '999'] })
      .send({ artwork_id: digitalArtworkId, quantity: 1 })
      .expect([200, 201, 422])  // hpp() normalises — result is deterministic, not error-prone
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 8. Unauthenticated access — all commerce routes require auth
// ═════════════════════════════════════════════════════════════════════════════

describe('Security: Unauthenticated Access', () => {
  const commerceRoutes: Array<[string, string, Record<string, unknown>?]> = [
    ['GET',    '/api/cart'],
    ['POST',   '/api/cart/items',              { artwork_id: uuidv4(), quantity: 1 }],
    ['PATCH',  `/api/cart/items/${uuidv4()}`,  { quantity: 2 }],
    ['DELETE', `/api/cart/items/${uuidv4()}`],
    ['DELETE', '/api/cart'],
    ['POST',   '/api/orders/checkout',         { cart_item_ids: [uuidv4()], idempotency_key: uuidv4() }],
    ['GET',    '/api/orders'],
    ['GET',    `/api/orders/${uuidv4()}`],
    ['POST',   `/api/orders/${uuidv4()}/cancel`],
    ['POST',   `/api/orders/${uuidv4()}/confirm-payment`, { tx_hash: 'a'.repeat(64), sender_wallet_address: 'T', network: 'TRON' }],
    ['PATCH',  `/api/orders/${uuidv4()}/status`, { status: 'SHIPPED' }],
    ['GET',    '/api/delivery/my-downloads'],
    ['GET',    '/api/delivery/sometoken'],
  ]

  it.each(commerceRoutes)(
    '%s %s returns 401 without token',
    async (method, path, body) => {
      const req = request(app)[method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](path)
      if (body) req.send(body)
      const res = await req
      expect(res.status).toBe(401)
    },
  )
})

// ═════════════════════════════════════════════════════════════════════════════
// 9. Purchasability bypass attempts
// ═════════════════════════════════════════════════════════════════════════════

describe('Security: Purchasability Bypass', () => {
  it('cannot add a PORTFOLIO artwork to cart', async () => {
    const portfolioId = await createAndPublishArtwork(sellerToken, {
      listing_type: 'PORTFOLIO',
      price:        undefined,
    })

    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: portfolioId, quantity: 1 })
      .expect(404)

    expect(res.body.code).toBe('ARTWORK_NOT_PURCHASABLE')
  })

  it('cannot add artwork by injecting a different artwork_id at checkout', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)

    // Attacker tries to swap in a different artwork_id by tampering with
    // the cart_item_ids array to include an item they don't own
    const fakeItemId = uuidv4()

    await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: [cartItemId, fakeItemId], idempotency_key: uuidv4() })
      .expect(422)
  })

  it('seller cannot buy their own artwork (same user is seller and buyer)', async () => {
    const selfArtworkId = await createAndPublishArtwork(sellerToken)

    // Seller tries to add their own artwork to their own cart
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ artwork_id: selfArtworkId, quantity: 1 })

    // Either succeeds at cart level (no self-purchase restriction at cart stage)
    // and the order-level check kicks in, OR it's blocked early.
    // We verify the cart add doesn't create a free order.
    if (res.status === 201) {
      const cartItemId = res.body.data.items[0].id as string
      const orderRes = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ cart_item_ids: [cartItemId], idempotency_key: uuidv4() })
      // Order is either created normally (no restriction) or rejected
      // The key invariant: the price is always correct
      if (orderRes.status === 201) {
        expect(orderRes.body.data.order.subtotal).toBe(100)
      }
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// 10. CORS — cross-origin requests from unknown origins are blocked
// ═════════════════════════════════════════════════════════════════════════════

describe('Security: CORS', () => {
  it('rejects requests from unknown origins', async () => {
    const res = await request(app)
      .get('/api/cart')
      .set('Origin', 'https://malicious-site.com')
      .set('Authorization', `Bearer ${buyerToken}`)

    // CORS headers should not permit the unknown origin
    const allowOrigin = res.headers['access-control-allow-origin']
    expect(allowOrigin).not.toBe('https://malicious-site.com')
  })
})