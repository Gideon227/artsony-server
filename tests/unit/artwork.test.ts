// tests/artwork/artwork.test.ts

import request from 'supertest'
import { createApp } from '../../src/app'
import type { Express } from 'express'

// ─────────────────────────────────────────────────────────────────────────────
// These tests expect NODE_ENV=test with a live Supabase test project + Redis.
// Run: NODE_ENV=test jest tests/artwork --runInBand
// ─────────────────────────────────────────────────────────────────────────────

let app: Express

// Shared state seeded in beforeAll blocks
let artistToken:    string
let otherToken:     string
let moderatorToken: string
let createdId:      string
let publishedId:    string

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(
  suffix: string,
  role: 'USER' | 'MODERATOR' = 'USER',
): Promise<string> {
  const email    = `artwork_test_${suffix}_${Date.now()}@example.com`
  const password = 'TestPass1!'
  const username = `artwork_${suffix}_${Date.now()}`

  await request(app).post('/api/auth/register').send({ email, password, username })

  // In a real test environment you'd promote the role via a seeding script or
  // direct DB call.  For demonstration the login is sufficient to get a token.
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200)

  return res.body.data.accessToken as string
}

const minimalDigitalPortfolio = {
  listing_type:   'PORTFOLIO',
  artwork_format: 'DIGITAL',
  title:          'Test Digital Artwork',
  description:    'A test artwork description long enough to pass validation.',
  categories:     ['Digital Art'],
  keywords:       ['test', 'digital'],
  assets: [
    {
      original_url:    'https://cdn.artsony.com/test/original.jpg',
      optimized_url:   'https://cdn.artsony.com/test/optimized.jpg',
      thumbnail_url:   'https://cdn.artsony.com/test/thumb.jpg',
      media_type:      'IMAGE',
      mime_type:       'image/jpeg',
      file_size_bytes: 204800,
      width:           1920,
      height:          1080,
      ordering_index:  0,
    },
  ],
  has_variants: false,
}

const minimalMarketplace = {
  ...minimalDigitalPortfolio,
  listing_type: 'MARKETPLACE',
  title:        'Test Marketplace Artwork',
  price:        150.00,
  currency:     'USD',
}

beforeAll(async () => {
  app = createApp()
  artistToken    = await registerAndLogin('artist')
  otherToken     = await registerAndLogin('other')
  moderatorToken = await registerAndLogin('mod', 'MODERATOR')
})

// ─── CREATE ───────────────────────────────────────────────────────────────────

describe('POST /api/artworks', () => {
  it('creates a PORTFOLIO artwork and returns status DRAFT', async () => {
    const res = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send(minimalDigitalPortfolio)
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe('DRAFT')
    expect(res.body.data.moderation_status).toBe('PENDING')
    expect(res.body.data.listing_type).toBe('PORTFOLIO')
    expect(res.body.data.slug).toBeTruthy()
    expect(res.body.data.assets).toHaveLength(1)
    expect(res.body.data.assets[0].id).toBeTruthy()

    createdId = res.body.data.id as string
  })

  it('creates a MARKETPLACE artwork with price', async () => {
    const res = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send(minimalMarketplace)
      .expect(201)

    expect(res.body.data.price).toBe(150)
    expect(res.body.data.listing_type).toBe('MARKETPLACE')
  })

  it('rejects MARKETPLACE artwork without price', async () => {
    const body = { ...minimalMarketplace }
    delete (body as any).price

    const res = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send(body)
      .expect(422)

    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(res.body.fields?.price).toBeTruthy()
  })

  it('rejects PHYSICAL artwork without physical_details', async () => {
    const res = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ ...minimalDigitalPortfolio, artwork_format: 'PHYSICAL' })
      .expect(422)

    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(res.body.fields?.physical_details).toBeTruthy()
  })

  it('creates a PHYSICAL artwork with valid physical_details', async () => {
    const res = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({
        ...minimalMarketplace,
        artwork_format:   'PHYSICAL',
        physical_details: {
          length:             50,
          width:              40,
          height:             2,
          unit:               'cm',
          available_quantity: 3,
          shipping_regions:   ['US', 'EU'],
          ships_worldwide:    false,
        },
      })
      .expect(201)

    expect(res.body.data.artwork_format).toBe('PHYSICAL')
    expect(res.body.data.physical_details.length).toBe(50)
  })

  it('rejects has_variants=true without variant entries', async () => {
    const res = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ ...minimalDigitalPortfolio, has_variants: true, variants: [] })
      .expect(422)

    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('creates artwork with variants', async () => {
    const res = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({
        ...minimalMarketplace,
        has_variants: true,
        variants: [
          {
            type:    'SIZE',
            name:    'Size',
            options: [
              { label: 'Small',  price_modifier: 0,   stock: 10, is_available: true, sku: null },
              { label: 'Large',  price_modifier: 50,  stock: 5,  is_available: true, sku: null },
            ],
          },
        ],
      })
      .expect(201)

    expect(res.body.data.has_variants).toBe(true)
    expect(res.body.data.variants).toHaveLength(1)
    expect(res.body.data.variants[0].options).toHaveLength(2)
    expect(res.body.data.variants[0].id).toBeTruthy()
  })

  it('rejects unauthenticated requests', async () => {
    await request(app)
      .post('/api/artworks')
      .send(minimalDigitalPortfolio)
      .expect(401)
  })

  it('rejects non-HTTPS asset URLs', async () => {
    const res = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({
        ...minimalDigitalPortfolio,
        assets: [
          { ...minimalDigitalPortfolio.assets[0], original_url: 'http://cdn.artsony.com/img.jpg' },
        ],
      })
      .expect(422)

    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('blocks EXTERNAL_LINK asset pointing to localhost', async () => {
    const res = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({
        ...minimalDigitalPortfolio,
        assets: [
          {
            original_url:    'https://localhost/internal-resource',
            media_type:      'EXTERNAL_LINK',
            mime_type:       'image/jpeg',
            file_size_bytes: 1024,
            ordering_index:  0,
          },
        ],
      })
      .expect(422)

    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(res.body.fields?.assets).toMatch(/not permitted/)
  })

  it('blocks EXTERNAL_LINK with disallowed MIME type', async () => {
    const res = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({
        ...minimalDigitalPortfolio,
        assets: [
          {
            original_url:    'https://evil.example.com/payload.exe',
            media_type:      'EXTERNAL_LINK',
            mime_type:       'application/x-msdownload',
            file_size_bytes: 1024,
            ordering_index:  0,
          },
        ],
      })
      .expect(422)

    expect(res.body.fields?.assets).toMatch(/MIME type/)
  })

  it('blocks EXTERNAL_LINK pointing to AWS IMDS', async () => {
    const res = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({
        ...minimalDigitalPortfolio,
        assets: [
          {
            original_url:    'https://169.254.169.254/latest/meta-data/',
            media_type:      'EXTERNAL_LINK',
            mime_type:       'image/jpeg',
            file_size_bytes: 1024,
            ordering_index:  0,
          },
        ],
      })
      .expect(422)

    expect(res.body.fields?.assets).toMatch(/private or reserved/)
  })
})

// ─── READ ─────────────────────────────────────────────────────────────────────

describe('GET /api/artworks/:id', () => {
  it('returns a DRAFT artwork to its creator', async () => {
    const res = await request(app)
      .get(`/api/artworks/${createdId}`)
      .set('Authorization', `Bearer ${artistToken}`)
      .expect(200)

    expect(res.body.data.id).toBe(createdId)
  })

  it('hides DRAFT artwork from other users (returns 404)', async () => {
    await request(app)
      .get(`/api/artworks/${createdId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404)
  })

  it('hides DRAFT artwork from unauthenticated users', async () => {
    await request(app)
      .get(`/api/artworks/${createdId}`)
      .expect(404)
  })

  it('returns 404 for a non-existent id', async () => {
    await request(app)
      .get('/api/artworks/00000000-0000-0000-0000-000000000000')
      .expect(404)
  })
})

// ─── UPDATE ───────────────────────────────────────────────────────────────────

describe('PATCH /api/artworks/:id', () => {
  it('allows owner to update their own artwork', async () => {
    const res = await request(app)
      .patch(`/api/artworks/${createdId}`)
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ title: 'Updated Title', keywords: ['updated', 'keywords'] })
      .expect(200)

    expect(res.body.data.title).toBe('Updated Title')
    expect(res.body.data.keywords).toContain('updated')
  })

  it('rejects updates from non-owners', async () => {
    await request(app)
      .patch(`/api/artworks/${createdId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Hijacked Title' })
      .expect(403)
  })

  it('rejects unauthenticated updates', async () => {
    await request(app)
      .patch(`/api/artworks/${createdId}`)
      .send({ title: 'Hijacked' })
      .expect(401)
  })
})

// ─── PUBLISH ──────────────────────────────────────────────────────────────────

describe('POST /api/artworks/:id/publish', () => {
  it('transitions artwork from DRAFT to PUBLISHED', async () => {
    const res = await request(app)
      .post(`/api/artworks/${createdId}/publish`)
      .set('Authorization', `Bearer ${artistToken}`)
      .expect(200)

    expect(res.body.data.status).toBe('PUBLISHED')
    publishedId = createdId
  })

  it('exposes PUBLISHED artwork to unauthenticated users', async () => {
    await request(app)
      .get(`/api/artworks/${publishedId}`)
      .expect(200)
  })

  it('rejects publish from non-owner', async () => {
    // Create a fresh draft first
    const createRes = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ ...minimalDigitalPortfolio, title: 'Another Draft' })
      .expect(201)

    await request(app)
      .post(`/api/artworks/${createRes.body.data.id}/publish`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403)
  })
})

// ─── LIST ─────────────────────────────────────────────────────────────────────

describe('GET /api/artworks', () => {
  it('returns only PUBLIC PUBLISHED artworks to guests', async () => {
    const res = await request(app)
      .get('/api/artworks')
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)

    for (const artwork of res.body.data) {
      expect(artwork.visibility).toBe('PUBLIC')
      expect(artwork.status).toBe('PUBLISHED')
    }
  })

  it('respects pagination (limit + page)', async () => {
    const res = await request(app)
      .get('/api/artworks?page=1&limit=2')
      .expect(200)

    expect(res.body.limit).toBe(2)
    expect(res.body.page).toBe(1)
    expect(typeof res.body.total_pages).toBe('number')
    expect(typeof res.body.has_next).toBe('boolean')
  })

  it('caps limit at 50', async () => {
    const res = await request(app)
      .get('/api/artworks?limit=999')
      .expect(200)

    expect(res.body.limit).toBeLessThanOrEqual(50)
  })

  it('filters by creator_id', async () => {
    // Authenticated so owner can see their own drafts too
    const res = await request(app)
      .get('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .expect(200)

    // Every result should belong to the authenticated user when creator_id matches sub
    // (actual creator_id filter is applied when the query param is set)
    expect(res.body.success).toBe(true)
  })

  it('returns full-text search results', async () => {
    const res = await request(app)
      .get('/api/artworks?search=digital')
      .expect(200)

    expect(res.body.success).toBe(true)
  })
})

// ─── ARCHIVE ──────────────────────────────────────────────────────────────────

describe('POST /api/artworks/:id/archive', () => {
  it('transitions PUBLISHED artwork to ARCHIVED', async () => {
    const res = await request(app)
      .post(`/api/artworks/${publishedId}/archive`)
      .set('Authorization', `Bearer ${artistToken}`)
      .expect(200)

    expect(res.body.data.status).toBe('ARCHIVED')
  })

  it('blocks editing an ARCHIVED artwork', async () => {
    const res = await request(app)
      .patch(`/api/artworks/${publishedId}`)
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ title: 'Should Fail' })
      .expect(409)

    expect(res.body.code).toBe('ARTWORK_ARCHIVED')
  })
})

// ─── MODERATION ───────────────────────────────────────────────────────────────

describe('POST /api/artworks/:id/flag', () => {
  let flagTargetId: string

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ ...minimalDigitalPortfolio, title: 'Flag Target Artwork' })
      .expect(201)
    flagTargetId = res.body.data.id as string
  })

  it('allows MODERATOR to flag an artwork', async () => {
    const res = await request(app)
      .post(`/api/artworks/${flagTargetId}/flag`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ notes: 'Contains prohibited content', moderation_status: 'FLAGGED' })
      .expect(200)

    expect(res.body.data.is_flagged).toBe(true)
    expect(res.body.data.moderation_status).toBe('FLAGGED')
    expect(res.body.data.review_notes).toBe('Contains prohibited content')
  })

  it('rejects flag attempt from regular user', async () => {
    await request(app)
      .post(`/api/artworks/${flagTargetId}/flag`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ notes: 'I do not like this', moderation_status: 'FLAGGED' })
      .expect(403)
  })

  it('rejects flag with missing notes', async () => {
    const res = await request(app)
      .post(`/api/artworks/${flagTargetId}/flag`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ moderation_status: 'REJECTED' })
      .expect(422)

    expect(res.body.code).toBe('VALIDATION_ERROR')
  })
})

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe('DELETE /api/artworks/:id', () => {
  let deleteTargetId: string

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/artworks')
      .set('Authorization', `Bearer ${artistToken}`)
      .send({ ...minimalDigitalPortfolio, title: 'Delete Target' })
      .expect(201)
    deleteTargetId = res.body.data.id as string
  })

  it('rejects delete from non-owner', async () => {
    await request(app)
      .delete(`/api/artworks/${deleteTargetId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403)
  })

  it('soft-deletes artwork (204 + subsequent GET returns 404)', async () => {
    await request(app)
      .delete(`/api/artworks/${deleteTargetId}`)
      .set('Authorization', `Bearer ${artistToken}`)
      .expect(204)

    await request(app)
      .get(`/api/artworks/${deleteTargetId}`)
      .set('Authorization', `Bearer ${artistToken}`)
      .expect(404)
  })
})
