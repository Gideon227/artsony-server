import request from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import { createApp } from '../../src/app'
import type { Express } from 'express'

// Requires NODE_ENV=test with seeded Supabase + Redis + PLATFORM_WALLET_TRON env var.
// Run: NODE_ENV=test jest tests/integration/order --runInBand

let app: Express

let buyerToken:   string
let sellerToken:  string
let otherToken:   string

let digitalArtworkId:  string
let physicalArtworkId: string

// ── Helpers ───────────────────────────────────────────────────────────────────

async function registerAndLogin(suffix: string): Promise<string> {
  const ts       = Date.now()
  const email    = `order_test_${suffix}_${ts}@example.com`
  const password = 'TestPass1!'
  const username = `order_${suffix}_${ts}`
  await request(app).post('/api/auth/register').send({ email, password, username })
  const res = await request(app).post('/api/auth/login').send({ email, password }).expect(200)
  return res.body.data.accessToken as string
}

async function createAndPublishArtwork(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const base = {
    listing_type:   'MARKETPLACE',
    artwork_format: 'DIGITAL',
    title:          `Order Test Artwork ${Date.now()}`,
    description:    'Integration test artwork.',
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
  }

  const create = await request(app)
    .post('/api/artworks')
    .set('Authorization', `Bearer ${token}`)
    .send(base)
    .expect(201)

  const id: string = create.body.data.id

  await request(app)
    .post(`/api/artworks/${id}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)

  return id
}

async function addToCart(
  token: string,
  artworkId: string,
  quantity = 1,
): Promise<string> {
  const res = await request(app)
    .post('/api/cart/items')
    .set('Authorization', `Bearer ${token}`)
    .send({ artwork_id: artworkId, quantity })
    .expect(201)

  return res.body.data.items[0].id as string
}

async function checkout(
  token: string,
  cartItemIds: string[],
  extras: Record<string, unknown> = {},
): Promise<{ orderId: string; txId: string; walletAddress: string; amount: number }> {
  const res = await request(app)
    .post('/api/orders/checkout')
    .set('Authorization', `Bearer ${token}`)
    .send({ cart_item_ids: cartItemIds, idempotency_key: uuidv4(), ...extras })
    .expect(201)

  return {
    orderId:       res.body.data.order.id,
    txId:          res.body.data.payment_instructions.transaction_id,
    walletAddress: res.body.data.payment_instructions.recipient_wallet_address,
    amount:        res.body.data.payment_instructions.amount,
  }
}

const validShippingAddress = {
  full_name:      'Test Buyer',
  phone:          '+2341234567890',
  address_line_1: '12 Test Street',
  address_line_2: null,
  city:           'Lagos',
  state:          'Lagos',
  postal_code:    '100001',
  country_code:   'NG',
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  app = createApp()

  buyerToken  = await registerAndLogin('buyer')
  sellerToken = await registerAndLogin('seller')
  otherToken  = await registerAndLogin('other')

  digitalArtworkId  = await createAndPublishArtwork(sellerToken, { artwork_format: 'DIGITAL' })
  physicalArtworkId = await createAndPublishArtwork(sellerToken, {
    artwork_format:   'PHYSICAL',
    physical_details: {
      length: 30, width: 20, height: 2, unit: 'cm',
      available_quantity: 10,
      shipping_regions: ['NG'],
      ships_worldwide: false,
    },
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Authentication
// ═════════════════════════════════════════════════════════════════════════════

describe('Orders — authentication', () => {
  it('GET /api/orders returns 401 without token', async () => {
    await request(app).get('/api/orders').expect(401)
  })

  it('POST /api/orders/checkout returns 401 without token', async () => {
    await request(app).post('/api/orders/checkout').send({}).expect(401)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/orders/checkout
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/orders/checkout', () => {
  it('creates an order for a digital artwork', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)

    const res = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: [cartItemId], idempotency_key: uuidv4() })
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.order.status).toBe('PENDING_PAYMENT')
    expect(res.body.data.order.items).toHaveLength(1)
    expect(res.body.data.order.items[0].artwork_format).toBe('DIGITAL')
    expect(res.body.data.payment_instructions.network).toBe('TRON')
    expect(typeof res.body.data.payment_instructions.amount).toBe('number')
  })

  it('creates an order for a physical artwork with shipping address', async () => {
    const cartItemId = await addToCart(buyerToken, physicalArtworkId, 2)

    const res = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        cart_item_ids:    [cartItemId],
        idempotency_key:  uuidv4(),
        shipping_address: validShippingAddress,
      })
      .expect(201)

    expect(res.body.data.order.shipping_address.city).toBe('Lagos')
    expect(res.body.data.order.items[0].quantity).toBe(2)
    expect(res.body.data.order.subtotal).toBe(200)
  })

  it('computes total server-side — ignores any client-provided totals', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)

    const res = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        cart_item_ids:   [cartItemId],
        idempotency_key: uuidv4(),
        total:           0.01,  // attacker tries to set price to 1 cent
      })
      .expect(201)

    expect(res.body.data.order.subtotal).toBe(100)
  })

  it('returns same order for duplicate idempotency_key (idempotency)', async () => {
    const cartItemId    = await addToCart(buyerToken, digitalArtworkId)
    const idemKey       = uuidv4()

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

  it('returns 422 when physical artwork has no shipping_address', async () => {
    const cartItemId = await addToCart(buyerToken, physicalArtworkId)

    const res = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: [cartItemId], idempotency_key: uuidv4() })
      .expect(422)

    expect(res.body.fields?.shipping_address).toBeDefined()
  })

  it('returns 422 when cart_item_ids is empty', async () => {
    await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: [], idempotency_key: uuidv4() })
      .expect(422)
  })

  it('returns 422 when idempotency_key is not a UUID', async () => {
    await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: [uuidv4()], idempotency_key: 'not-a-uuid' })
      .expect(422)
  })

  it('returns 422 when cart_item_ids contains a non-UUID', async () => {
    await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: ['not-a-uuid'], idempotency_key: uuidv4() })
      .expect(422)
  })

  it('returns 422 when cart item belongs to a different user', async () => {
    const cartItemId = await addToCart(otherToken, digitalArtworkId)

    await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: [cartItemId], idempotency_key: uuidv4() })
      .expect(422)
  })

  it('snapshots artwork title on order_item at checkout time', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)

    const res = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ cart_item_ids: [cartItemId], idempotency_key: uuidv4() })
      .expect(201)

    expect(typeof res.body.data.order.items[0].artwork_title).toBe('string')
    expect(res.body.data.order.items[0].artwork_title.length).toBeGreaterThan(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/orders
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/orders', () => {
  it('returns buyer order list with pagination', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data.data)).toBe(true)
    expect(typeof res.body.data.total).toBe('number')
    expect(typeof res.body.data.page).toBe('number')
  })

  it('filters by status', async () => {
    const res = await request(app)
      .get('/api/orders?status=PENDING_PAYMENT')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200)

    const orders = res.body.data.data as any[]
    orders.forEach(o => expect(o.status).toBe('PENDING_PAYMENT'))
  })

  it('returns 422 for invalid status filter', async () => {
    await request(app)
      .get('/api/orders?status=INVALID_STATUS')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(422)
  })

  it('returns empty list for a user with no orders', async () => {
    const freshToken = await registerAndLogin('fresh_buyer')
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${freshToken}`)
      .expect(200)

    expect(res.body.data.data).toHaveLength(0)
    expect(res.body.data.total).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/orders/:id
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/orders/:id', () => {
  it('returns full order detail for the buyer', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200)

    expect(res.body.data.id).toBe(orderId)
    expect(Array.isArray(res.body.data.items)).toBe(true)
  })

  it('returns 403 when a third party requests someone else\'s order', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403)
  })

  it('returns 404 for a non-existent order', async () => {
    await request(app)
      .get('/api/orders/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(404)
  })

  it('returns 422 for a non-UUID id param', async () => {
    await request(app)
      .get('/api/orders/not-a-uuid')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(422)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/orders/:id/confirm-payment
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/orders/:id/confirm-payment', () => {
  it('moves transaction to CONFIRMING and returns updated state', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    const res = await request(app)
      .post(`/api/orders/${orderId}/confirm-payment`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        tx_hash:               'a'.repeat(64),
        sender_wallet_address: 'TSenderWalletAddress',
        network:               'TRON',
      })
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.payment_instructions.transaction_id).toBeDefined()
  })

  it('returns 409 when same tx_hash is submitted twice', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])
    const txHash = 'b'.repeat(64)

    await request(app)
      .post(`/api/orders/${orderId}/confirm-payment`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ tx_hash: txHash, sender_wallet_address: 'TSender', network: 'TRON' })
      .expect(200)

    await request(app)
      .post(`/api/orders/${orderId}/confirm-payment`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ tx_hash: txHash, sender_wallet_address: 'TSender', network: 'TRON' })
      .expect(409)
  })

  it('returns 422 for invalid tx_hash format', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    await request(app)
      .post(`/api/orders/${orderId}/confirm-payment`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ tx_hash: 'short', sender_wallet_address: 'TSender', network: 'TRON' })
      .expect(422)
  })

  it('returns 422 for invalid network value', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    await request(app)
      .post(`/api/orders/${orderId}/confirm-payment`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ tx_hash: 'a'.repeat(64), sender_wallet_address: 'TSender', network: 'INVALID' })
      .expect(422)
  })

  it('returns 403 when another user tries to confirm payment', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    await request(app)
      .post(`/api/orders/${orderId}/confirm-payment`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ tx_hash: 'c'.repeat(64), sender_wallet_address: 'TSender', network: 'TRON' })
      .expect(403)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/orders/:id/cancel
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/orders/:id/cancel', () => {
  it('cancels a PENDING_PAYMENT order', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    const res = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200)

    expect(res.body.data.status).toBe('CANCELLED')
  })

  it('returns 403 when a non-buyer tries to cancel', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403)
  })

  it('returns 422 when order is already CANCELLED', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    const { orderId } = await checkout(buyerToken, [cartItemId])

    await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200)

    await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(422)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/orders/sales
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/orders/sales', () => {
  it('returns empty sales list for a user who has no sales', async () => {
    const freshToken = await registerAndLogin('fresh_seller')
    const res = await request(app)
      .get('/api/orders/sales')
      .set('Authorization', `Bearer ${freshToken}`)
      .expect(200)

    expect(res.body.data.data).toHaveLength(0)
  })

  it('returns sales list for seller after a buyer checks out', async () => {
    const cartItemId = await addToCart(buyerToken, digitalArtworkId)
    await checkout(buyerToken, [cartItemId])

    const res = await request(app)
      .get('/api/orders/sales')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200)

    expect(res.body.data.total).toBeGreaterThan(0)
  })
})