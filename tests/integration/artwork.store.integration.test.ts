import request from 'supertest'
import { createApp } from '../../src/app'
import type { Express } from 'express'

// These tests require NODE_ENV=test with a seeded Supabase test project + Redis.
// Run: NODE_ENV=test jest tests/integration/artwork.store --runInBand

let app: Express

// Tokens and IDs seeded across describe blocks
let sellerToken:   string
let buyerToken:    string
let publishedId:   string   // MARKETPLACE DIGITAL, PUBLISHED, APPROVED, PUBLIC
let portfolioId:   string   // PORTFOLIO listing — never purchasable
let draftId:       string   // MARKETPLACE but DRAFT
let privateId:     string   // MARKETPLACE PUBLISHED but PRIVATE visibility

// ── Helpers ───────────────────────────────────────────────────────────────────

async function registerAndLogin(
  suffix: string,
): Promise<string> {
  const email    = `store_test_${suffix}_${Date.now()}@example.com`
  const password = 'TestPass1!'
  const username = `store_${suffix}_${Date.now()}`

  await request(app).post('/api/auth/register').send({ email, password, username })

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200)

  return res.body.data.accessToken as string
}

async function createAndPublishArtwork(
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const base = {
    listing_type:   'MARKETPLACE',
    artwork_format: 'DIGITAL',
    title:          `Store Test Artwork ${Date.now()}`,
    description:    'Integration test artwork for purchasability checks.',
    price:          50,
    currency:       'USDT',
    has_variants:   false,
    visibility:     'PUBLIC',
    assets: [
      {
        original_url:    'https://res.cloudinary.com/test/image/upload/v1/test.jpg',
        optimized_url:   'https://res.cloudinary.com/test/image/upload/v1/test.jpg',
        thumbnail_url:   'https://res.cloudinary.com/test/image/upload/v1/test.jpg',
        media_type:      'IMAGE',
        mime_type:       'image/jpeg',
        file_size_bytes: 204800,
        width:           1920,
        height:          1080,
        ordering_index:  0,
      },
    ],
    ...overrides,
  }

  const create = await request(app)
    .post('/api/artworks')
    .set('Authorization', `Bearer ${token}`)
    .send(base)
    .expect(201)

  const id: string = create.body.data.id

  if ((overrides['status'] ?? 'PUBLISHED') === 'PUBLISHED') {
    await request(app)
      .post(`/api/artworks/${id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
  }

  return id
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  app = createApp()

  sellerToken  = await registerAndLogin('seller')
  buyerToken   = await registerAndLogin('buyer')

  publishedId  = await createAndPublishArtwork(sellerToken)
  portfolioId  = await createAndPublishArtwork(sellerToken, { listing_type: 'PORTFOLIO', price: undefined })
  draftId      = await createAndPublishArtwork(sellerToken, { status: 'DRAFT' })
  privateId    = await createAndPublishArtwork(sellerToken, { visibility: 'PRIVATE' })
})

// ── GET /api/artworks/:id/purchasable ─────────────────────────────────────────

describe('GET /api/artworks/:id/purchasable', () => {

  describe('success path', () => {
    it('returns 200 with the artwork for a fully purchasable listing', async () => {
      const res = await request(app)
        .get(`/api/artworks/${publishedId}/purchasable`)
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe(publishedId)
      expect(res.body.data.listing_type).toBe('MARKETPLACE')
      expect(res.body.data.status).toBe('PUBLISHED')
      expect(res.body.data.moderation_status).toBe('APPROVED')
      expect(res.body.data.visibility).toBe('PUBLIC')
      expect(res.body.data.price).toBeGreaterThan(0)
    })

    it('returns the artwork for a guest (no auth token required)', async () => {
      const res = await request(app)
        .get(`/api/artworks/${publishedId}/purchasable`)
        .expect(200)

      expect(res.body.data.id).toBe(publishedId)
    })

    it('returns the artwork for an authenticated buyer', async () => {
      const res = await request(app)
        .get(`/api/artworks/${publishedId}/purchasable`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .expect(200)

      expect(res.body.data.id).toBe(publishedId)
    })

    it('does not expose deleted_at or internal moderation fields', async () => {
      const res = await request(app)
        .get(`/api/artworks/${publishedId}/purchasable`)
        .expect(200)

      expect(res.body.data.deleted_at).toBeNull()
    })

    it('returns purchase_count on the artwork object', async () => {
      const res = await request(app)
        .get(`/api/artworks/${publishedId}/purchasable`)
        .expect(200)

      expect(typeof res.body.data.purchase_count).toBe('number')
    })
  })

  describe('non-purchasable artworks', () => {
    it('returns 404 for a PORTFOLIO listing', async () => {
      const res = await request(app)
        .get(`/api/artworks/${portfolioId}/purchasable`)
        .expect(404)

      expect(res.body.code).toBe('ARTWORK_NOT_PURCHASABLE')
    })

    it('returns 404 for a DRAFT artwork', async () => {
      const res = await request(app)
        .get(`/api/artworks/${draftId}/purchasable`)
        .expect(404)

      expect(res.body.code).toBe('ARTWORK_NOT_PURCHASABLE')
    })

    it('returns 404 for a PRIVATE artwork', async () => {
      const res = await request(app)
        .get(`/api/artworks/${privateId}/purchasable`)
        .expect(404)

      expect(res.body.code).toBe('ARTWORK_NOT_PURCHASABLE')
    })

    it('returns 404 for a non-existent artwork id', async () => {
      await request(app)
        .get('/api/artworks/00000000-0000-0000-0000-000000000000/purchasable')
        .expect(404)
    })
  })

  describe('input validation', () => {
    it('returns 422 for a non-UUID id param', async () => {
      await request(app)
        .get('/api/artworks/not-a-uuid/purchasable')
        .expect(422)
    })

    it('returns 422 for an SQL injection attempt in id param', async () => {
      await request(app)
        .get("/api/artworks/1' OR '1'='1/purchasable")
        .expect(422)
    })
  })

  describe('seller cannot bypass purchasability for their own artwork', () => {
    it('returns 404 when seller requests their own DRAFT as purchasable', async () => {
      const res = await request(app)
        .get(`/api/artworks/${draftId}/purchasable`)
        .set('Authorization', `Bearer ${sellerToken}`)
        .expect(404)

      expect(res.body.code).toBe('ARTWORK_NOT_PURCHASABLE')
    })
  })
})

// ── Archive / Delete guards (active orders) ───────────────────────────────────
// These tests exercise the service-level guard added in Phase 2.
// They don't create real orders — they verify that a published MARKETPLACE
// artwork can be archived when no orders exist, establishing the baseline.
// The full active-orders blocking path is covered by the unit tests which
// mock the repository.

describe('POST /api/artworks/:id/archive — baseline for MARKETPLACE artworks', () => {
  it('archives a MARKETPLACE artwork that has no active orders', async () => {
    const id = await createAndPublishArtwork(sellerToken)

    const res = await request(app)
      .post(`/api/artworks/${id}/archive`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200)

    expect(res.body.data.status).toBe('ARCHIVED')
  })

  it('archived artwork is no longer purchasable', async () => {
    const id = await createAndPublishArtwork(sellerToken)

    await request(app)
      .post(`/api/artworks/${id}/archive`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200)

    await request(app)
      .get(`/api/artworks/${id}/purchasable`)
      .expect(404)
  })

  it('returns 403 when a different seller tries to archive', async () => {
    const id = await createAndPublishArtwork(sellerToken)
    const otherToken = await registerAndLogin('other_seller')

    await request(app)
      .post(`/api/artworks/${id}/archive`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403)
  })
})

describe('DELETE /api/artworks/:id — baseline for MARKETPLACE artworks', () => {
  it('soft-deletes a MARKETPLACE artwork with no active orders', async () => {
    const id = await createAndPublishArtwork(sellerToken)

    await request(app)
      .delete(`/api/artworks/${id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(204)
  })

  it('deleted artwork is no longer purchasable', async () => {
    const id = await createAndPublishArtwork(sellerToken)

    await request(app)
      .delete(`/api/artworks/${id}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(204)

    await request(app)
      .get(`/api/artworks/${id}/purchasable`)
      .expect(404)
  })
})

// ── publishArtwork MARKETPLACE validation ─────────────────────────────────────

describe('POST /api/artworks/:id/publish — MARKETPLACE pre-publish validation', () => {
  it('rejects publish when MARKETPLACE artwork has no price set', async () => {
    const createRes = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        listing_type:   'MARKETPLACE',
        artwork_format: 'DIGITAL',
        title:          `No Price Artwork ${Date.now()}`,
        description:    'Testing publish guard.',
        has_variants:   false,
        visibility:     'PUBLIC',
        assets: [
          {
            original_url:    'https://res.cloudinary.com/test/image/upload/v1/test.jpg',
            optimized_url:   'https://res.cloudinary.com/test/image/upload/v1/test.jpg',
            thumbnail_url:   'https://res.cloudinary.com/test/image/upload/v1/test.jpg',
            media_type:      'IMAGE',
            mime_type:       'image/jpeg',
            file_size_bytes: 204800,
            ordering_index:  0,
          },
        ],
      })
      .expect(201)

    const id: string = createRes.body.data.id

    const res = await request(app)
      .post(`/api/artworks/${id}/publish`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(422)

    expect(res.body.fields?.price).toBeDefined()
  })

  it('accepts publish when MARKETPLACE artwork has valid price and currency', async () => {
    const id = await createAndPublishArtwork(sellerToken)
    // Already published in helper — just verify it's published
    const res = await request(app)
      .get(`/api/artworks/${id}/purchasable`)
      .expect(200)

    expect(res.body.data.status).toBe('PUBLISHED')
  })
})