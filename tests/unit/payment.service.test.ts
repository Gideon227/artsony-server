import type { Transaction } from '../../src/common/types/commerce.types'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../src/modules/order/repositories/order.repository', () => ({
  orderRepository: {
    findById:               jest.fn(),
    findTransactionByOrder: jest.fn(),
    updateTransaction:      jest.fn(),
  },
}))

jest.mock('../../src/modules/order/services/order.service', () => ({
  orderService: {
    fulfillOrder:      jest.fn(),
    expireStaleOrders: jest.fn(),
  },
}))

jest.mock('../../src/modules/payment/adapters/blockchain.adapter', () => ({
  getBlockchainAdapter: jest.fn(),
}))

jest.mock('../../src/modules/redis/redis.client', () => ({
  redisGet: jest.fn().mockResolvedValue(null),
  redisSet: jest.fn().mockResolvedValue(undefined),
  redisDel: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../src/config/database', () => ({
  supabase:     jest.fn(() => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: { order_id: 'order-1' }, error: null }),
  })),
  assertNoError: jest.fn(),
}))

import { paymentService } from '../../src/modules/payment/services/payment.service'
import { orderRepository } from '../../src/modules/order/repositories/order.repository'
import { orderService } from '../../src/modules/order/services/order.service'
import { getBlockchainAdapter } from '../../src/modules/payment/adapters/blockchain.adapter'
import { redisGet, redisDel } from '../../src/modules/redis/redis.client'
import { AppError } from '../../src/common/errors'

const mockOrderRepo    = orderRepository   as jest.Mocked<typeof orderRepository>
const mockOrderService = orderService      as jest.Mocked<typeof orderService>
const mockGetAdapter   = getBlockchainAdapter as jest.MockedFunction<typeof getBlockchainAdapter>
const mockRedisGet     = redisGet as jest.MockedFunction<typeof redisGet>
const mockRedisDel     = redisDel as jest.MockedFunction<typeof redisDel>

// ── Factories ─────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id:                       'tx-1',
    order_id:                 'order-1',
    status:                   'CONFIRMING',
    amount:                   100,
    currency:                 'USDT',
    network:                  'TRON',
    recipient_wallet_address: 'TWalletRecipient',
    sender_wallet_address:    'TSenderWallet',
    tx_hash:                  'a'.repeat(64),
    confirmation_block:       null,
    retry_count:              0,
    last_retry_at:            null,
    expires_at:               new Date(Date.now() + 30 * 60 * 1000),
    confirmed_at:             null,
    created_at:               new Date(),
    updated_at:               new Date(),
    ...overrides,
  }
}

function makeAdapter(result: any) {
  return { verifyTransaction: jest.fn().mockResolvedValue(result) }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockRedisGet.mockResolvedValue(null)  // no lock by default
  mockOrderRepo.findTransactionByOrder.mockResolvedValue(makeTx())
  mockOrderRepo.updateTransaction.mockResolvedValue(makeTx())
})

// ═════════════════════════════════════════════════════════════════════════════
// verifyTransaction — confirmed path
// ═════════════════════════════════════════════════════════════════════════════

describe('paymentService.verifyTransaction — confirmed', () => {
  it('calls fulfillOrder when blockchain confirms the transaction', async () => {
    const adapter = makeAdapter({ confirmed: true, block: 12345, amount: 100, recipient: 'TWalletRecipient' })
    mockGetAdapter.mockReturnValue(adapter as any)
    mockOrderService.fulfillOrder.mockResolvedValue({} as any)

    await paymentService.verifyTransaction('tx-1')

    expect(mockOrderService.fulfillOrder).toHaveBeenCalledWith('order-1', 12345)
  })

  it('releases the distributed lock after successful verification', async () => {
    const adapter = makeAdapter({ confirmed: true, block: 999, amount: 100, recipient: 'TWalletRecipient' })
    mockGetAdapter.mockReturnValue(adapter as any)
    mockOrderService.fulfillOrder.mockResolvedValue({} as any)

    await paymentService.verifyTransaction('tx-1')

    expect(mockRedisDel).toHaveBeenCalledWith(expect.stringContaining('tx-1'))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// verifyTransaction — not yet confirmed (retry paths)
// ═════════════════════════════════════════════════════════════════════════════

describe('paymentService.verifyTransaction — pending / retry', () => {
  it('increments retry_count when transaction is PENDING in mempool', async () => {
    const adapter = makeAdapter({ confirmed: false, reason: 'PENDING' })
    mockGetAdapter.mockReturnValue(adapter as any)

    await paymentService.verifyTransaction('tx-1')

    expect(mockOrderRepo.updateTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ retry_count: 1 }),
    )
    expect(mockOrderService.fulfillOrder).not.toHaveBeenCalled()
  })

  it('increments retry_count when tx_hash is NOT_FOUND yet', async () => {
    const adapter = makeAdapter({ confirmed: false, reason: 'NOT_FOUND' })
    mockGetAdapter.mockReturnValue(adapter as any)

    await paymentService.verifyTransaction('tx-1')

    expect(mockOrderRepo.updateTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ retry_count: 1 }),
    )
  })

  it('marks transaction FAILED immediately for WRONG_RECIPIENT', async () => {
    const adapter = makeAdapter({ confirmed: false, reason: 'WRONG_RECIPIENT' })
    mockGetAdapter.mockReturnValue(adapter as any)

    await paymentService.verifyTransaction('tx-1')

    expect(mockOrderRepo.updateTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: 'FAILED' }),
    )
    expect(mockOrderService.fulfillOrder).not.toHaveBeenCalled()
  })

  it('marks transaction FAILED immediately for WRONG_AMOUNT', async () => {
    const adapter = makeAdapter({ confirmed: false, reason: 'WRONG_AMOUNT' })
    mockGetAdapter.mockReturnValue(adapter as any)

    await paymentService.verifyTransaction('tx-1')

    expect(mockOrderRepo.updateTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: 'FAILED' }),
    )
  })

  it('marks transaction FAILED for adapter FAILED reason', async () => {
    const adapter = makeAdapter({ confirmed: false, reason: 'FAILED' })
    mockGetAdapter.mockReturnValue(adapter as any)

    await paymentService.verifyTransaction('tx-1')

    expect(mockOrderRepo.updateTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: 'FAILED' }),
    )
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// verifyTransaction — guard conditions
// ═════════════════════════════════════════════════════════════════════════════

describe('paymentService.verifyTransaction — guards', () => {
  it('skips verification when distributed lock is already held', async () => {
    mockRedisGet.mockResolvedValue('1')  // lock exists

    await paymentService.verifyTransaction('tx-1')

    expect(mockGetAdapter).not.toHaveBeenCalled()
    expect(mockOrderRepo.updateTransaction).not.toHaveBeenCalled()
  })

  it('skips when transaction status is not CONFIRMING', async () => {
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(
      makeTx({ status: 'CONFIRMED' }),
    )
    const adapter = makeAdapter({ confirmed: true, block: 1 })
    mockGetAdapter.mockReturnValue(adapter as any)

    await paymentService.verifyTransaction('tx-1')

    expect(adapter.verifyTransaction).not.toHaveBeenCalled()
  })

  it('skips when tx_hash is null', async () => {
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(
      makeTx({ tx_hash: null }),
    )
    const adapter = makeAdapter({ confirmed: true, block: 1 })
    mockGetAdapter.mockReturnValue(adapter as any)

    await paymentService.verifyTransaction('tx-1')

    expect(adapter.verifyTransaction).not.toHaveBeenCalled()
  })

  it('expires transaction when current time is past expires_at', async () => {
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(
      makeTx({ expires_at: new Date(Date.now() - 1000) }),
    )

    await paymentService.verifyTransaction('tx-1')

    expect(mockOrderRepo.updateTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: 'EXPIRED' }),
    )
    expect(mockGetAdapter).not.toHaveBeenCalled()
  })

  it('marks FAILED when retry_count has reached MAX_RETRY_COUNT (5)', async () => {
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(
      makeTx({ retry_count: 5 }),
    )

    await paymentService.verifyTransaction('tx-1')

    expect(mockOrderRepo.updateTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: 'FAILED' }),
    )
    expect(mockGetAdapter).not.toHaveBeenCalled()
  })

  it('always releases the distributed lock even when adapter throws', async () => {
    const adapter = { verifyTransaction: jest.fn().mockRejectedValue(new Error('Network timeout')) }
    mockGetAdapter.mockReturnValue(adapter as any)

    // Should not throw — error is caught in verifyTransaction try/finally
    await expect(paymentService.verifyTransaction('tx-1')).resolves.toBeUndefined()

    expect(mockRedisDel).toHaveBeenCalledWith(expect.stringContaining('tx-1'))
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// getRetryDelayMs — backoff schedule
// ═════════════════════════════════════════════════════════════════════════════

describe('paymentService.getRetryDelayMs', () => {
  it('returns 30s for first retry', () => {
    expect(paymentService.getRetryDelayMs(0)).toBe(30_000)
  })

  it('returns 60s for second retry', () => {
    expect(paymentService.getRetryDelayMs(1)).toBe(60_000)
  })

  it('returns 600s for fifth retry (max backoff)', () => {
    expect(paymentService.getRetryDelayMs(4)).toBe(600_000)
  })

  it('clamps to max backoff when retry_count exceeds schedule length', () => {
    expect(paymentService.getRetryDelayMs(99)).toBe(600_000)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// getPaymentStatus
// ═════════════════════════════════════════════════════════════════════════════

describe('paymentService.getPaymentStatus', () => {
  it('returns payment status from DB for the order buyer', async () => {
    const order = {
      id: 'order-1', buyer_id: 'buyer-1',
      items: [{ seller_id: 'seller-1' }],
    }
    mockOrderRepo.findById.mockResolvedValue(order as any)
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(makeTx())

    const result = await paymentService.getPaymentStatus('order-1', 'buyer-1')

    expect(result.transaction.id).toBe('tx-1')
    expect(result.payment_instructions.amount).toBe(100)
  })

  it('returns from cache when warm', async () => {
    const cached = { transaction: makeTx(), payment_instructions: {} }
    mockRedisGet.mockResolvedValue(JSON.stringify(cached))

    const result = await paymentService.getPaymentStatus('order-1', 'buyer-1')

    expect(mockOrderRepo.findById).not.toHaveBeenCalled()
    expect(result.transaction.id).toBe('tx-1')
  })

  it('throws FORBIDDEN for a third party', async () => {
    const order = {
      id: 'order-1', buyer_id: 'buyer-1',
      items: [{ seller_id: 'seller-1' }],
    }
    mockOrderRepo.findById.mockResolvedValue(order as any)

    await expect(
      paymentService.getPaymentStatus('order-1', 'random-user'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('throws ORDER_NOT_FOUND for non-existent order', async () => {
    mockOrderRepo.findById.mockResolvedValue(undefined)

    await expect(
      paymentService.getPaymentStatus('bad-id', 'buyer-1'),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' })
  })
})