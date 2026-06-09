import {
  enforceIsPurchasable,
} from '../../src/modules/artwork/services/artwork.service'
import type { Artwork } from '../../src/common/types/artwork.types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id:                   'artwork-uuid-1',
    listing_type:         'MARKETPLACE',
    artwork_format:       'DIGITAL',
    title:                'Test Piece',
    description:          'A test artwork.',
    slug:                 'test-piece',
    categories:           [],
    keywords:             [],
    creator_id:           'creator-uuid-1',
    creator:              null,
    collaborator_ids:     [],
    tools_used:           [],
    assets:               [],
    visibility:           'PUBLIC',
    allow_moodboard_save: true,
    allow_comments:       true,
    allow_likes:          true,
    show_engagement_stats:true,
    status:               'PUBLISHED',
    is_flagged:           false,
    moderation_status:    'APPROVED',
    reviewed_by:          null,
    review_notes:         null,
    price:                50,
    currency:             'USDT',
    max_purchase_quantity:null,
    physical_details:     null,
    has_variants:         false,
    variants:             [],
    view_count:           0,
    like_count:           0,
    save_count:           0,
    comment_count:        0,
    purchase_count:       0,
    created_at:           new Date(),
    updated_at:           new Date(),
    deleted_at:           null,
    ...overrides,
  }
}

// ── enforceIsPurchasable ──────────────────────────────────────────────────────

describe('enforceIsPurchasable', () => {
  it('does not throw for a fully valid purchasable artwork', () => {
    expect(() => enforceIsPurchasable(makeArtwork())).not.toThrow()
  })

  it('throws ARTWORK_NOT_FOR_SALE when listing_type is PORTFOLIO', () => {
    expect(() =>
      enforceIsPurchasable(makeArtwork({ listing_type: 'PORTFOLIO' }))
    ).toThrow(expect.objectContaining({ code: 'ARTWORK_NOT_FOR_SALE' }))
  })

  it('throws ARTWORK_NOT_PUBLISHED when status is DRAFT', () => {
    expect(() =>
      enforceIsPurchasable(makeArtwork({ status: 'DRAFT' }))
    ).toThrow(expect.objectContaining({ code: 'ARTWORK_NOT_PUBLISHED' }))
  })

  it('throws ARTWORK_NOT_PUBLISHED when status is ARCHIVED', () => {
    expect(() =>
      enforceIsPurchasable(makeArtwork({ status: 'ARCHIVED' }))
    ).toThrow(expect.objectContaining({ code: 'ARTWORK_NOT_PUBLISHED' }))
  })

  it('throws ARTWORK_NOT_PUBLISHED when status is UNDER_REVIEW', () => {
    expect(() =>
      enforceIsPurchasable(makeArtwork({ status: 'UNDER_REVIEW' }))
    ).toThrow(expect.objectContaining({ code: 'ARTWORK_NOT_PUBLISHED' }))
  })

  it('throws ARTWORK_NOT_APPROVED when moderation_status is PENDING', () => {
    expect(() =>
      enforceIsPurchasable(makeArtwork({ moderation_status: 'PENDING' }))
    ).toThrow(expect.objectContaining({ code: 'ARTWORK_NOT_APPROVED' }))
  })

  it('throws ARTWORK_NOT_APPROVED when moderation_status is REJECTED', () => {
    expect(() =>
      enforceIsPurchasable(makeArtwork({ moderation_status: 'REJECTED' }))
    ).toThrow(expect.objectContaining({ code: 'ARTWORK_NOT_APPROVED' }))
  })

  it('throws ARTWORK_NOT_PUBLIC when visibility is PRIVATE', () => {
    expect(() =>
      enforceIsPurchasable(makeArtwork({ visibility: 'PRIVATE' }))
    ).toThrow(expect.objectContaining({ code: 'ARTWORK_NOT_PUBLIC' }))
  })

  it('throws ARTWORK_NOT_PUBLIC when visibility is UNLISTED', () => {
    expect(() =>
      enforceIsPurchasable(makeArtwork({ visibility: 'UNLISTED' }))
    ).toThrow(expect.objectContaining({ code: 'ARTWORK_NOT_PUBLIC' }))
  })

  it('throws ARTWORK_FLAGGED when is_flagged is true', () => {
    expect(() =>
      enforceIsPurchasable(makeArtwork({ is_flagged: true }))
    ).toThrow(expect.objectContaining({ code: 'ARTWORK_FLAGGED' }))
  })

  it('throws ARTWORK_NO_PRICE when price is null', () => {
    expect(() =>
      enforceIsPurchasable(makeArtwork({ price: null }))
    ).toThrow(expect.objectContaining({ code: 'ARTWORK_NO_PRICE' }))
  })

  it('throws ARTWORK_NO_PRICE when price is undefined', () => {
    expect(() =>
      enforceIsPurchasable(makeArtwork({ price: undefined }))
    ).toThrow(expect.objectContaining({ code: 'ARTWORK_NO_PRICE' }))
  })

  it('throws the first failing condition — listing_type checked before status', () => {
    expect(() =>
      enforceIsPurchasable(
        makeArtwork({ listing_type: 'PORTFOLIO', status: 'DRAFT' }),
      )
    ).toThrow(expect.objectContaining({ code: 'ARTWORK_NOT_FOR_SALE' }))
  })

  it('throws the first failing condition — status checked before moderation', () => {
    expect(() =>
      enforceIsPurchasable(
        makeArtwork({ status: 'DRAFT', moderation_status: 'PENDING' }),
      )
    ).toThrow(expect.objectContaining({ code: 'ARTWORK_NOT_PUBLISHED' }))
  })

  it('does not throw for price of 0 — free artworks are valid', () => {
    expect(() =>
      enforceIsPurchasable(makeArtwork({ price: 0 }))
    ).not.toThrow()
  })
})

// ── Service-level mocked tests ────────────────────────────────────────────────
// These tests mock the repository layer to validate service orchestration
// without hitting the DB.

jest.mock('../../src/modules/artwork/repositories/artwork.repository', () => ({
  artworkRepository: {
    findById:             jest.fn(),
    findPurchasableById:  jest.fn(),
    hasActiveOrders:      jest.fn(),
    updateStatus:         jest.fn(),
    update:               jest.fn(),
    softDelete:           jest.fn(),
    reserveStock:         jest.fn(),
    releaseStock:         jest.fn(),
    generateSlug:         jest.fn(),
    incrementViewCount:   jest.fn(),
    list:                 jest.fn(),
    flag:                 jest.fn(),
  },
}))

jest.mock('../../src/modules/redis/redis.client', () => ({
  redisGet: jest.fn().mockResolvedValue(null),
  redisSet: jest.fn().mockResolvedValue(undefined),
  redisDel: jest.fn().mockResolvedValue(undefined),
  getRedis: jest.fn().mockReturnValue({
    scan: jest.fn().mockResolvedValue(['0', []]),
    del:  jest.fn().mockResolvedValue(undefined),
  }),
}))

import { artworkRepository } from '../../src/modules/artwork/repositories/artwork.repository'
import {
  archiveArtwork,
  deleteArtwork,
  updateArtwork,
  publishArtwork,
  getPurchasableArtwork,
} from '../../src/modules/artwork/services/artwork.service'

const repo = artworkRepository as jest.Mocked<typeof artworkRepository>

beforeEach(() => {
  jest.clearAllMocks()
})

// ── archiveArtwork ────────────────────────────────────────────────────────────

describe('archiveArtwork', () => {
  it('blocks archive when MARKETPLACE artwork has active orders', async () => {
    repo.findById.mockResolvedValue(makeArtwork({ listing_type: 'MARKETPLACE' }))
    repo.hasActiveOrders.mockResolvedValue(true)

    await expect(
      archiveArtwork('artwork-uuid-1', 'creator-uuid-1', 'USER'),
    ).rejects.toThrow(expect.objectContaining({ code: 'ARTWORK_HAS_ACTIVE_ORDERS' }))

    expect(repo.updateStatus).not.toHaveBeenCalled()
  })

  it('allows archive when MARKETPLACE artwork has no active orders', async () => {
    repo.findById.mockResolvedValue(makeArtwork({ listing_type: 'MARKETPLACE' }))
    repo.hasActiveOrders.mockResolvedValue(false)
    repo.updateStatus.mockResolvedValue(makeArtwork({ status: 'ARCHIVED' }))

    const result = await archiveArtwork('artwork-uuid-1', 'creator-uuid-1', 'USER')

    expect(result.status).toBe('ARCHIVED')
    expect(repo.hasActiveOrders).toHaveBeenCalledWith('artwork-uuid-1')
  })

  it('skips the active orders check for PORTFOLIO artworks', async () => {
    repo.findById.mockResolvedValue(makeArtwork({ listing_type: 'PORTFOLIO' }))
    repo.updateStatus.mockResolvedValue(makeArtwork({ status: 'ARCHIVED' }))

    await archiveArtwork('artwork-uuid-1', 'creator-uuid-1', 'USER')

    expect(repo.hasActiveOrders).not.toHaveBeenCalled()
  })

  it('throws ForbiddenError when requester does not own the artwork', async () => {
    repo.findById.mockResolvedValue(makeArtwork({ creator_id: 'other-creator' }))

    await expect(
      archiveArtwork('artwork-uuid-1', 'creator-uuid-1', 'USER'),
    ).rejects.toThrow(expect.objectContaining({ statusCode: 403 }))
  })

  it('allows ADMIN to archive any artwork regardless of ownership', async () => {
    repo.findById.mockResolvedValue(makeArtwork({
      listing_type: 'MARKETPLACE',
      creator_id:   'other-creator',
    }))
    repo.hasActiveOrders.mockResolvedValue(false)
    repo.updateStatus.mockResolvedValue(makeArtwork({ status: 'ARCHIVED' }))

    await expect(
      archiveArtwork('artwork-uuid-1', 'admin-uuid', 'ADMIN'),
    ).resolves.not.toThrow()
  })
})

// ── deleteArtwork ─────────────────────────────────────────────────────────────

describe('deleteArtwork', () => {
  it('blocks delete when MARKETPLACE artwork has active orders', async () => {
    repo.findById.mockResolvedValue(makeArtwork({ listing_type: 'MARKETPLACE' }))
    repo.hasActiveOrders.mockResolvedValue(true)

    await expect(
      deleteArtwork('artwork-uuid-1', 'creator-uuid-1', 'USER'),
    ).rejects.toThrow(expect.objectContaining({ code: 'ARTWORK_HAS_ACTIVE_ORDERS' }))

    expect(repo.softDelete).not.toHaveBeenCalled()
  })

  it('calls softDelete when no active orders exist', async () => {
    repo.findById.mockResolvedValue(makeArtwork({ listing_type: 'MARKETPLACE' }))
    repo.hasActiveOrders.mockResolvedValue(false)
    repo.softDelete.mockResolvedValue(undefined)

    await deleteArtwork('artwork-uuid-1', 'creator-uuid-1', 'USER')

    expect(repo.softDelete).toHaveBeenCalledWith('artwork-uuid-1')
  })

  it('skips active orders check for PORTFOLIO artworks', async () => {
    repo.findById.mockResolvedValue(makeArtwork({ listing_type: 'PORTFOLIO' }))
    repo.softDelete.mockResolvedValue(undefined)

    await deleteArtwork('artwork-uuid-1', 'creator-uuid-1', 'USER')

    expect(repo.hasActiveOrders).not.toHaveBeenCalled()
    expect(repo.softDelete).toHaveBeenCalledWith('artwork-uuid-1')
  })
})

// ── updateArtwork (price/variant guard) ───────────────────────────────────────

describe('updateArtwork — price/variant change guard', () => {
  it('blocks price change on MARKETPLACE artwork with active orders', async () => {
    repo.findById.mockResolvedValue(makeArtwork({ listing_type: 'MARKETPLACE', status: 'PUBLISHED' }))
    repo.hasActiveOrders.mockResolvedValue(true)

    await expect(
      updateArtwork('artwork-uuid-1', { price: 99 }, 'creator-uuid-1', 'USER'),
    ).rejects.toThrow(expect.objectContaining({ code: 'ARTWORK_HAS_ACTIVE_ORDERS' }))

    expect(repo.update).not.toHaveBeenCalled()
  })

  it('blocks variant change on MARKETPLACE artwork with active orders', async () => {
    repo.findById.mockResolvedValue(makeArtwork({ listing_type: 'MARKETPLACE', status: 'PUBLISHED' }))
    repo.hasActiveOrders.mockResolvedValue(true)

    await expect(
      updateArtwork('artwork-uuid-1', { variants: [] }, 'creator-uuid-1', 'USER'),
    ).rejects.toThrow(expect.objectContaining({ code: 'ARTWORK_HAS_ACTIVE_ORDERS' }))
  })

  it('allows non-price field update on MARKETPLACE artwork with active orders', async () => {
    repo.findById.mockResolvedValue(makeArtwork({ listing_type: 'MARKETPLACE', status: 'PUBLISHED' }))
    repo.update.mockResolvedValue(makeArtwork({ title: 'New Title' }))

    await expect(
      updateArtwork('artwork-uuid-1', { title: 'New Title' }, 'creator-uuid-1', 'USER'),
    ).resolves.not.toThrow()

    expect(repo.hasActiveOrders).not.toHaveBeenCalled()
  })

  it('does not check active orders for PORTFOLIO artworks on price change', async () => {
    repo.findById.mockResolvedValue(makeArtwork({ listing_type: 'PORTFOLIO', status: 'PUBLISHED' }))
    repo.update.mockResolvedValue(makeArtwork({ price: 10 }))

    await updateArtwork('artwork-uuid-1', { price: 10 }, 'creator-uuid-1', 'USER')

    expect(repo.hasActiveOrders).not.toHaveBeenCalled()
  })
})

// ── publishArtwork (marketplace pre-publish validation) ───────────────────────

describe('publishArtwork — marketplace validation', () => {
  it('throws when price is missing on a MARKETPLACE listing', async () => {
    repo.findById.mockResolvedValue(
      makeArtwork({ listing_type: 'MARKETPLACE', price: null, assets: [{ id: 'a1' } as any] }),
    )

    await expect(
      publishArtwork('artwork-uuid-1', 'creator-uuid-1', 'USER'),
    ).rejects.toThrow(expect.objectContaining({ fields: expect.objectContaining({ price: expect.any(String) }) }))
  })

  it('throws when price is 0 on a MARKETPLACE listing', async () => {
    repo.findById.mockResolvedValue(
      makeArtwork({ listing_type: 'MARKETPLACE', price: 0, assets: [{ id: 'a1' } as any] }),
    )

    await expect(
      publishArtwork('artwork-uuid-1', 'creator-uuid-1', 'USER'),
    ).rejects.toThrow(expect.objectContaining({ fields: expect.objectContaining({ price: expect.any(String) }) }))
  })

  it('throws when currency is missing on a MARKETPLACE listing', async () => {
    repo.findById.mockResolvedValue(
      makeArtwork({
        listing_type: 'MARKETPLACE',
        price: 50,
        currency: '',
        assets: [{ id: 'a1' } as any],
      }),
    )

    await expect(
      publishArtwork('artwork-uuid-1', 'creator-uuid-1', 'USER'),
    ).rejects.toThrow(expect.objectContaining({ fields: expect.objectContaining({ currency: expect.any(String) }) }))
  })

  it('throws when physical MARKETPLACE artwork has no physical_details', async () => {
    repo.findById.mockResolvedValue(
      makeArtwork({
        listing_type:     'MARKETPLACE',
        artwork_format:   'PHYSICAL',
        price:            50,
        currency:         'USDT',
        physical_details: null,
        assets:           [{ id: 'a1' } as any],
      }),
    )

    await expect(
      publishArtwork('artwork-uuid-1', 'creator-uuid-1', 'USER'),
    ).rejects.toThrow(expect.objectContaining({ fields: expect.objectContaining({ physical_details: expect.any(String) }) }))
  })

  it('publishes successfully when all MARKETPLACE conditions are met', async () => {
    repo.findById.mockResolvedValue(
      makeArtwork({
        listing_type:   'MARKETPLACE',
        price:          50,
        currency:       'USDT',
        assets:         [{ id: 'a1' } as any],
      }),
    )
    repo.updateStatus.mockResolvedValue(makeArtwork({ status: 'PUBLISHED' }))

    await expect(
      publishArtwork('artwork-uuid-1', 'creator-uuid-1', 'USER'),
    ).resolves.not.toThrow()

    expect(repo.updateStatus).toHaveBeenCalledWith('artwork-uuid-1', 'PUBLISHED', 'APPROVED')
  })

  it('publishes PORTFOLIO artwork without price validation', async () => {
    repo.findById.mockResolvedValue(
      makeArtwork({
        listing_type: 'PORTFOLIO',
        price:        null,
        assets:       [{ id: 'a1' } as any],
      }),
    )
    repo.updateStatus.mockResolvedValue(makeArtwork({ status: 'PUBLISHED' }))

    await expect(
      publishArtwork('artwork-uuid-1', 'creator-uuid-1', 'USER'),
    ).resolves.not.toThrow()
  })
})

// ── getPurchasableArtwork ─────────────────────────────────────────────────────

describe('getPurchasableArtwork', () => {
  it('returns the artwork when it is purchasable', async () => {
    const artwork = makeArtwork()
    repo.findPurchasableById.mockResolvedValue(artwork)

    const result = await getPurchasableArtwork('artwork-uuid-1')

    expect(result.id).toBe('artwork-uuid-1')
    expect(repo.findPurchasableById).toHaveBeenCalledWith('artwork-uuid-1')
  })

  it('throws ARTWORK_NOT_PURCHASABLE when findPurchasableById returns undefined', async () => {
    repo.findPurchasableById.mockResolvedValue(undefined)

    await expect(
      getPurchasableArtwork('nonexistent-uuid'),
    ).rejects.toThrow(expect.objectContaining({ code: 'ARTWORK_NOT_PURCHASABLE' }))
  })

  it('throws ARTWORK_FLAGGED when cached artwork is flagged', async () => {
    const { redisGet } = require('../../src/modules/redis/redis.client') as jest.Mocked<any>
    redisGet.mockResolvedValueOnce(JSON.stringify(makeArtwork({ is_flagged: true })))

    await expect(
      getPurchasableArtwork('artwork-uuid-1'),
    ).rejects.toThrow(expect.objectContaining({ code: 'ARTWORK_FLAGGED' }))

    expect(repo.findPurchasableById).not.toHaveBeenCalled()
  })
})