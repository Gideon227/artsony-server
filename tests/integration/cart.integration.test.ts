import request from 'supertest'
import { createApp } from '../../src/app'
import type { Express } from 'express'

// Requires NODE_ENV=test with a seeded Supabase test project + Redis.
// Run: NODE_ENV=test jest tests/integration/cart --runInBand

let app: Express

let buyerToken:  string
let sellerToken: string

// IDs created during setup
let digitalArtworkId:        string
let physicalArtworkId:        string
let variantPhysicalArtworkId: string
let portfolioArtworkId:       string

// ── Helpers ───────────────────────────────────────────────────────────────────

async function registerAndLogin(suffix: string): Promise<string> {
  const email    = `cart_test_${suffix}_${Date.now()}@example.com`
  const password = 'TestPass1!'
  const username = `cart_${suffix}_${Date.now()}`
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
    title:          `Cart Test Artwork ${Date.now()}`,
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

  if (overrides['status'] !== 'DRAFT') {
    await request(app)
      .post(`/api/artworks/${id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
  }

  return id
}

async function clearBuyerCart(): Promise<void> {
  await request(app)
    .delete('/api/cart')
    .set('Authorization', `Bearer ${buyerToken}`)
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  app = createApp()

  buyerToken  = await registerAndLogin('buyer')
  sellerToken = await registerAndLogin('seller')

  digitalArtworkId = await createAndPublishArtwork(sellerToken, {
    artwork_format: 'DIGITAL',
  })

  physicalArtworkId = await createAndPublishArtwork(sellerToken, {
    artwork_format:   'PHYSICAL',
    physical_details: {
      length: 30, width: 20, height: 2, unit: 'cm',
      available_quantity: 10,
      shipping_regions: ['NG'],
      ships_worldwide:  false,
    },
  })

  variantPhysicalArtworkId = await createAndPublishArtwork(sellerToken, {
    artwork_format:   'PHYSICAL',
    has_variants:     true,
    physical_details: {
      length: 30, width: 20, height: 2, unit: 'cm',
      available_quantity: 20,
      shipping_regions: ['NG'],
      ships_worldwide:  false,
    },
    variants: [{
      type:    'SIZE',
      name:    'Size',
      options: [
        { label: 'Small',  price_modifier: 0,   sku: null, stock: 5,  is_available: true },
        { label: 'Large',  price_modifier: 50,  sku: null, stock: 3,  is_available: true },
        { label: 'Custom', price_modifier: 100, sku: null, stock: 1,  is_available: false },
      ],
    }],
  })

  portfolioArtworkId = await createAndPublishArtwork(sellerToken, {
    listing_type: 'PORTFOLIO',
    price:        undefined,
  })
})

beforeEach(clearBuyerCart)

// ═════════════════════════════════════════════════════════════════════════════
// Authentication
// ═════════════════════════════════════════════════════════════════════════════

describe('Cart — authentication', () => {
  it('GET /api/cart returns 401 without token', async () => {
    await request(app).get('/api/cart').expect(401)
  })

  it('POST /api/cart/items returns 401 without token', async () => {
    await request(app).post('/api/cart/items').send({}).expect(401)
  })

  it('DELETE /api/cart returns 401 without token', async () => {
    await request(app).delete('/api/cart').expect(401)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/cart
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/cart', () => {
  it('returns an empty cart for a new user', async () => {
    const res = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.items).toHaveLength(0)
    expect(res.body.data.subtotal).toBe(0)
    expect(res.body.data.has_stale_items).toBe(false)
  })

  it('returns cart with item after adding', async () => {
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: digitalArtworkId, quantity: 1 })
      .expect(201)

    const res = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200)

    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.subtotal).toBe(100)
  })

  it('returns correct item_count and subtotal for multiple items', async () => {
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: digitalArtworkId, quantity: 1 })

    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: physicalArtworkId, quantity: 2 })

    const res = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200)

    expect(res.body.data.item_count).toBe(2)
    expect(res.body.data.subtotal).toBe(300)  // 100 + (100 * 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/cart/items
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/cart/items', () => {
  it('adds a digital artwork successfully', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: digitalArtworkId, quantity: 1 })
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].artwork.id).toBe(digitalArtworkId)
  })

  it('adds a physical artwork with quantity 3', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: physicalArtworkId, quantity: 3 })
      .expect(201)

    expect(res.body.data.items[0].quantity).toBe(3)
  })

  it('returns 422 when digital artwork quantity > 1', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: digitalArtworkId, quantity: 2 })
      .expect(422)

    expect(res.body.fields?.quantity).toBeDefined()
  })

  it('returns 409 when same digital artwork added twice', async () => {
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: digitalArtworkId, quantity: 1 })
      .expect(201)

    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: digitalArtworkId, quantity: 1 })
      .expect(409)

    expect(res.body.code).toBe('DIGITAL_ALREADY_IN_CART')
  })

  it('returns 404 when artwork is not purchasable (PORTFOLIO)', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: portfolioArtworkId, quantity: 1 })
      .expect(404)

    expect(res.body.code).toBe('ARTWORK_NOT_PURCHASABLE')
  })

  it('returns 422 when artwork_id is not a UUID', async () => {
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: 'not-a-uuid', quantity: 1 })
      .expect(422)
  })

  it('returns 422 when quantity is 0', async () => {
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: digitalArtworkId, quantity: 0 })
      .expect(422)
  })

  it('returns 422 when quantity is missing', async () => {
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: digitalArtworkId })
      .expect(422)
  })

  it('returns 422 when variant artwork receives no variant_option_id', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: variantPhysicalArtworkId, quantity: 1 })
      .expect(422)

    expect(res.body.fields?.variant_option_id).toBeDefined()
  })

  it('adds a variant artwork with valid variant_option_id', async () => {
    // Get variant option IDs from the artwork
    const artworkRes = await request(app)
      .get(`/api/artworks/${variantPhysicalArtworkId}`)
      .expect(200)

    const smallOptionId: string = artworkRes.body.data.variants[0].options[0].id

    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        artwork_id:        variantPhysicalArtworkId,
        quantity:          1,
        variant_option_id: smallOptionId,
      })
      .expect(201)

    expect(res.body.data.items[0].variant_snapshot.option_id).toBe(smallOptionId)
  })

  it('price snapshot captures base price for no-variant artwork', async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: physicalArtworkId, quantity: 1 })
      .expect(201)

    expect(res.body.data.items[0].price_at_add).toBe(100)
  })

  it('price snapshot captures base + modifier for variant artwork', async () => {
    const artworkRes = await request(app)
      .get(`/api/artworks/${variantPhysicalArtworkId}`)
      .expect(200)

    // Large has price_modifier: 50 → expected price 150
    const largeOptionId: string = artworkRes.body.data.variants[0].options[1].id

    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        artwork_id:        variantPhysicalArtworkId,
        quantity:          1,
        variant_option_id: largeOptionId,
      })
      .expect(201)

    expect(res.body.data.items[0].price_at_add).toBe(150)
  })

  it('returns 422 when variant_option_id is not a UUID', async () => {
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        artwork_id:        variantPhysicalArtworkId,
        quantity:          1,
        variant_option_id: 'not-a-uuid',
      })
      .expect(422)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// PATCH /api/cart/items/:id
// ═════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/cart/items/:id', () => {
  let physicalItemId: string

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: physicalArtworkId, quantity: 1 })
      .expect(201)

    physicalItemId = res.body.data.items[0].id as string
  })

  it('updates quantity for a physical artwork', async () => {
    const res = await request(app)
      .patch(`/api/cart/items/${physicalItemId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ quantity: 4 })
      .expect(200)

    const updated = res.body.data.items.find((i: any) => i.id === physicalItemId)
    expect(updated.quantity).toBe(4)
  })

  it('returns 422 when trying to update quantity of a digital artwork', async () => {
    const addRes = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: digitalArtworkId, quantity: 1 })
      .expect(201)

    const digitalItemId: string = addRes.body.data.items.find(
      (i: any) => i.artwork.id === digitalArtworkId,
    ).id

    await request(app)
      .patch(`/api/cart/items/${digitalItemId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ quantity: 1 })
      .expect(422)
  })

  it('returns 404 for item belonging to another user', async () => {
    const otherToken = await registerAndLogin('other_buyer')

    await request(app)
      .patch(`/api/cart/items/${physicalItemId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ quantity: 2 })
      .expect(404)
  })

  it('returns 422 when id param is not a UUID', async () => {
    await request(app)
      .patch('/api/cart/items/not-a-uuid')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ quantity: 2 })
      .expect(422)
  })

  it('returns 422 when quantity is 0', async () => {
    await request(app)
      .patch(`/api/cart/items/${physicalItemId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ quantity: 0 })
      .expect(422)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// DELETE /api/cart/items/:id
// ═════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/cart/items/:id', () => {
  it('removes the item and returns updated cart', async () => {
    const addRes = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: digitalArtworkId, quantity: 1 })
      .expect(201)

    const itemId: string = addRes.body.data.items[0].id

    const res = await request(app)
      .delete(`/api/cart/items/${itemId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200)

    expect(res.body.data.items).toHaveLength(0)
  })

  it('returns 404 for item belonging to another user', async () => {
    const addRes = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: digitalArtworkId, quantity: 1 })
      .expect(201)

    const itemId: string = addRes.body.data.items[0].id
    const otherToken = await registerAndLogin('remove_other')

    await request(app)
      .delete(`/api/cart/items/${itemId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404)
  })

  it('returns 422 when id param is not a UUID', async () => {
    await request(app)
      .delete('/api/cart/items/bad-id')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(422)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// DELETE /api/cart
// ═════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/cart', () => {
  it('clears all items and returns 204', async () => {
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: digitalArtworkId, quantity: 1 })
      .expect(201)

    await request(app)
      .delete('/api/cart')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(204)

    const res = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200)

    expect(res.body.data.items).toHaveLength(0)
  })

  it('returns 204 even when cart is already empty', async () => {
    await request(app)
      .delete('/api/cart')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(204)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Cart isolation between users
// ═════════════════════════════════════════════════════════════════════════════

describe('Cart isolation', () => {
  it('buyer and seller have completely separate carts', async () => {
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ artwork_id: physicalArtworkId, quantity: 1 })
      .expect(201)

    const sellerCart = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200)

    expect(sellerCart.body.data.items).toHaveLength(0)
  })
})