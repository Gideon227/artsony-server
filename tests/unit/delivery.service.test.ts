import crypto from 'crypto'
import type { DigitalDeliveryToken, OrderItem } from '../../src/common/types/commerce.types'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../src/modules/delivery/repositories/delivery.repository', () => ({
  deliveryRepository: {
    create:           jest.fn(),
    findByHash:       jest.fn(),
    findByOrderItem:  jest.fn(),
    findByBuyer:      jest.fn(),
    recordDownload:   jest.fn(),
  },
}))

jest.mock('../../src/modules/order/repositories/order.repository', () => ({
  orderRepository: {
    findById: jest.fn(),
  },
}))

jest.mock('../../src/modules/redis/redis.client', () => ({
  redisGet: jest.fn().mockResolvedValue(null),
  redisSet: jest.fn().mockResolvedValue(undefined),
  redisDel: jest.fn().mockResolvedValue(undefined),
}))

// Mock dynamic import of supabase used inside validateAndRedeem
jest.mock('../../src/config/database', () => ({
  supabase: jest.fn(() => ({
    from:   jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      error: null,
      data:  {
        assets: [{ ordering_index: 0, original_url: 'https://res.cloudinary.com/test/image/upload/v1/artwork.jpg', mime_type: 'image/jpeg' }],
        title:  'Test Artwork',
        slug:   'test-artwork',
      },
    }),
  })),
  assertNoError: jest.fn(),
}))

import { deliveryService } from '../../src/modules/delivery/services/delivery.service'
import { deliveryRepository } from '../../src/modules/delivery/repositories/delivery.repository'
import { orderRepository } from '../../src/modules/order/repositories/order.repository'
import { redisGet, redisDel } from '../../src/modules/redis/redis.client'
import { AppError, ForbiddenError } from '../../src/common/errors'

const mockDeliveryRepo = deliveryRepository as jest.Mocked<typeof deliveryRepository>
const mockOrderRepo    = orderRepository    as jest.Mocked<typeof orderRepository>
const mockRedisGet     = redisGet           as jest.MockedFunction<typeof redisGet>
const mockRedisDel     = redisDel           as jest.MockedFunction<typeof redisDel>

// ── Factories ─────────────────────────────────────────────────────────────────

function makeToken(overrides: Partial<DigitalDeliveryToken> = {}): DigitalDeliveryToken {
  return {
    id:                 'token-1',
    order_item_id:      'item-1',
    artwork_id:         'artwork-1',
    buyer_id:           'buyer-1',
    token_hash:         crypto.createHash('sha256').update('rawtoken123').digest('hex'),
    expires_at:         new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    download_count:     0,
    max_downloads:      3,
    last_downloaded_at: null,
    created_at:         new Date(),
    ...overrides,
  }
}

function makeOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id:                    'item-1',
    order_id:              'order-1',
    artwork_id:            'artwork-1',
    seller_id:             'seller-1',
    artwork_title:         'Test Artwork',
    artwork_slug:          'test-artwork',
    artwork_thumbnail_url: null,
    artwork_format:        'DIGITAL',
    unit_price:            100,
    currency:              'USDT',
    quantity:              1,
    line_total:            100,
    variant_snapshot:      null,
    created_at:            new Date(),
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockRedisGet.mockResolvedValue(null)
})

// ═════════════════════════════════════════════════════════════════════════════
// validateAndRedeem
// ═════════════════════════════════════════════════════════════════════════════

describe('deliveryService.validateAndRedeem', () => {
  const rawToken = 'rawtoken123'

  it('returns a signed URL for a valid token and correct buyer', async () => {
    const token = makeToken()
    mockDeliveryRepo.findByHash.mockResolvedValue(token)
    mockDeliveryRepo.recordDownload.mockResolvedValue({ ...token, download_count: 1 })

    const result = await deliveryService.validateAndRedeem(rawToken, 'buyer-1')

    expect(result.signed_url).toBeDefined()
    expect(typeof result.signed_url).toBe('string')
    expect(result.filename).toContain('test-artwork')
    expect(result.expires_at).toBeInstanceOf(Date)
  })

  it('records the download after successful redemption', async () => {
    const token = makeToken()
    mockDeliveryRepo.findByHash.mockResolvedValue(token)
    mockDeliveryRepo.recordDownload.mockResolvedValue({ ...token, download_count: 1 })

    await deliveryService.validateAndRedeem(rawToken, 'buyer-1')

    expect(mockDeliveryRepo.recordDownload).toHaveBeenCalledWith('token-1')
  })

  it('invalidates cache after download to reflect updated count', async () => {
    const token = makeToken()
    mockDeliveryRepo.findByHash.mockResolvedValue(token)
    mockDeliveryRepo.recordDownload.mockResolvedValue({ ...token, download_count: 1 })

    await deliveryService.validateAndRedeem(rawToken, 'buyer-1')

    expect(mockRedisDel).toHaveBeenCalledWith(expect.stringContaining(token.token_hash))
  })

  it('throws INVALID_DOWNLOAD_TOKEN when token hash is not found', async () => {
    mockDeliveryRepo.findByHash.mockResolvedValue(undefined)

    await expect(
      deliveryService.validateAndRedeem('nonexistent-token', 'buyer-1'),
    ).rejects.toMatchObject({ code: 'INVALID_DOWNLOAD_TOKEN' })
  })

  it('throws ForbiddenError when requester is not the token owner', async () => {
    const token = makeToken({ buyer_id: 'buyer-1' })
    mockDeliveryRepo.findByHash.mockResolvedValue(token)

    await expect(
      deliveryService.validateAndRedeem(rawToken, 'other-buyer'),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('throws DOWNLOAD_TOKEN_EXPIRED when token is past expires_at', async () => {
    const expired = makeToken({ expires_at: new Date(Date.now() - 1000) })
    mockDeliveryRepo.findByHash.mockResolvedValue(expired)

    await expect(
      deliveryService.validateAndRedeem(rawToken, 'buyer-1'),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_TOKEN_EXPIRED' })
  })

  it('clears cache when an expired token is detected', async () => {
    const expired = makeToken({ expires_at: new Date(Date.now() - 1000) })
    mockDeliveryRepo.findByHash.mockResolvedValue(expired)

    await expect(
      deliveryService.validateAndRedeem(rawToken, 'buyer-1'),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_TOKEN_EXPIRED' })

    expect(mockRedisDel).toHaveBeenCalled()
  })

  it('throws DOWNLOAD_LIMIT_REACHED when download_count equals max_downloads', async () => {
    const exhausted = makeToken({ download_count: 3, max_downloads: 3 })
    mockDeliveryRepo.findByHash.mockResolvedValue(exhausted)

    await expect(
      deliveryService.validateAndRedeem(rawToken, 'buyer-1'),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_LIMIT_REACHED' })
  })

  it('throws DOWNLOAD_LIMIT_REACHED when download_count exceeds max_downloads', async () => {
    const over = makeToken({ download_count: 5, max_downloads: 3 })
    mockDeliveryRepo.findByHash.mockResolvedValue(over)

    await expect(
      deliveryService.validateAndRedeem(rawToken, 'buyer-1'),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_LIMIT_REACHED' })
  })

  it('returns cached token on warm cache hit without hitting DB', async () => {
    const token = makeToken()
    mockRedisGet.mockResolvedValue(JSON.stringify(token))
    mockDeliveryRepo.recordDownload.mockResolvedValue({ ...token, download_count: 1 })

    await deliveryService.validateAndRedeem(rawToken, 'buyer-1')

    expect(mockDeliveryRepo.findByHash).not.toHaveBeenCalled()
  })

  it('does not record download before all guards pass — ownership check rejects first', async () => {
    const token = makeToken({ buyer_id: 'buyer-1' })
    mockDeliveryRepo.findByHash.mockResolvedValue(token)

    await expect(
      deliveryService.validateAndRedeem(rawToken, 'attacker'),
    ).rejects.toBeInstanceOf(ForbiddenError)

    expect(mockDeliveryRepo.recordDownload).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// generateTokensForOrder
// ═════════════════════════════════════════════════════════════════════════════

describe('deliveryService.generateTokensForOrder', () => {
  it('generates one token per digital order item', async () => {
    const order = {
      id:       'order-1',
      buyer_id: 'buyer-1',
      items:    [makeOrderItem({ id: 'item-1', artwork_format: 'DIGITAL' })],
    }
    mockOrderRepo.findById.mockResolvedValue(order as any)
    mockDeliveryRepo.findByOrderItem.mockResolvedValue(undefined)
    mockDeliveryRepo.create.mockResolvedValue(makeToken())

    const tokens = await deliveryService.generateTokensForOrder('order-1', 'buyer-1')

    expect(tokens).toHaveLength(1)
    expect(mockDeliveryRepo.create).toHaveBeenCalledTimes(1)
  })

  it('skips physical items — only digital items get tokens', async () => {
    const order = {
      id:       'order-1',
      buyer_id: 'buyer-1',
      items: [
        makeOrderItem({ id: 'item-1', artwork_format: 'DIGITAL' }),
        makeOrderItem({ id: 'item-2', artwork_format: 'PHYSICAL' }),
      ],
    }
    mockOrderRepo.findById.mockResolvedValue(order as any)
    mockDeliveryRepo.findByOrderItem.mockResolvedValue(undefined)
    mockDeliveryRepo.create.mockResolvedValue(makeToken())

    const tokens = await deliveryService.generateTokensForOrder('order-1', 'buyer-1')

    expect(tokens).toHaveLength(1)
    expect(mockDeliveryRepo.create).toHaveBeenCalledTimes(1)
  })

  it('returns existing token without creating a new one (idempotency)', async () => {
    const existingToken = makeToken()
    const order = {
      id:       'order-1',
      buyer_id: 'buyer-1',
      items:    [makeOrderItem({ artwork_format: 'DIGITAL' })],
    }
    mockOrderRepo.findById.mockResolvedValue(order as any)
    mockDeliveryRepo.findByOrderItem.mockResolvedValue(existingToken)

    const tokens = await deliveryService.generateTokensForOrder('order-1', 'buyer-1')

    expect(tokens).toHaveLength(1)
    expect(mockDeliveryRepo.create).not.toHaveBeenCalled()
    expect(tokens[0]!.id).toBe(existingToken.id)
  })

  it('returns empty array for orders with no digital items', async () => {
    const order = {
      id:       'order-1',
      buyer_id: 'buyer-1',
      items:    [makeOrderItem({ artwork_format: 'PHYSICAL' })],
    }
    mockOrderRepo.findById.mockResolvedValue(order as any)

    const tokens = await deliveryService.generateTokensForOrder('order-1', 'buyer-1')

    expect(tokens).toHaveLength(0)
    expect(mockDeliveryRepo.create).not.toHaveBeenCalled()
  })

  it('throws ORDER_NOT_FOUND when order does not exist', async () => {
    mockOrderRepo.findById.mockResolvedValue(undefined)

    await expect(
      deliveryService.generateTokensForOrder('bad-id', 'buyer-1'),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
  })

  it('generates separate tokens for multiple digital items in one order', async () => {
    const order = {
      id:       'order-1',
      buyer_id: 'buyer-1',
      items: [
        makeOrderItem({ id: 'item-1', artwork_id: 'art-1', artwork_format: 'DIGITAL' }),
        makeOrderItem({ id: 'item-2', artwork_id: 'art-2', artwork_format: 'DIGITAL' }),
      ],
    }
    mockOrderRepo.findById.mockResolvedValue(order as any)
    mockDeliveryRepo.findByOrderItem.mockResolvedValue(undefined)
    mockDeliveryRepo.create
      .mockResolvedValueOnce(makeToken({ id: 'tok-1', order_item_id: 'item-1' }))
      .mockResolvedValueOnce(makeToken({ id: 'tok-2', order_item_id: 'item-2' }))

    const tokens = await deliveryService.generateTokensForOrder('order-1', 'buyer-1')

    expect(tokens).toHaveLength(2)
    expect(mockDeliveryRepo.create).toHaveBeenCalledTimes(2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// getMyDownloads
// ═════════════════════════════════════════════════════════════════════════════

describe('deliveryService.getMyDownloads', () => {
  it('returns buyer download tokens from repository', async () => {
    const tokens = [makeToken(), makeToken({ id: 'token-2' })]
    mockDeliveryRepo.findByBuyer.mockResolvedValue(tokens)

    const result = await deliveryService.getMyDownloads('buyer-1')

    expect(mockDeliveryRepo.findByBuyer).toHaveBeenCalledWith('buyer-1')
    expect(result).toHaveLength(2)
  })

  it('returns empty array when buyer has no downloads', async () => {
    mockDeliveryRepo.findByBuyer.mockResolvedValue([])

    const result = await deliveryService.getMyDownloads('buyer-1')

    expect(result).toHaveLength(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Blockchain adapter — exhaustive network coverage
// ═════════════════════════════════════════════════════════════════════════════

describe('getBlockchainAdapter factory', () => {
  it('returns TronAdapter for TRON network', () => {
    const { getBlockchainAdapter: realAdapter } = jest.requireActual(
      '../../src/modules/payment/adapters/blockchain.adapter',
    )
    const adapter = realAdapter('TRON')
    expect(adapter.constructor.name).toBe('TronAdapter')
  })

  it('returns EthereumAdapter for ETHEREUM network', () => {
    const { getBlockchainAdapter: realAdapter } = jest.requireActual(
      '../../src/modules/payment/adapters/blockchain.adapter',
    )
    const adapter = realAdapter('ETHEREUM')
    expect(adapter.constructor.name).toBe('EthereumAdapter')
  })

  it('returns BscAdapter for BSC network', () => {
    const { getBlockchainAdapter: realAdapter } = jest.requireActual(
      '../../src/modules/payment/adapters/blockchain.adapter',
    )
    const adapter = realAdapter('BSC')
    expect(adapter.constructor.name).toBe('BscAdapter')
  })

  it('throws for an unknown network', () => {
    const { getBlockchainAdapter: realAdapter } = jest.requireActual(
      '../../src/modules/payment/adapters/blockchain.adapter',
    )
    expect(() => realAdapter('UNKNOWN' as any)).toThrow()
  })
})