// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockSingle    = jest.fn()
const mockSelect    = jest.fn()
const mockInsert    = jest.fn()
const mockUpdate    = jest.fn()
const mockEq        = jest.fn()
const mockIn        = jest.fn()
const mockOrder     = jest.fn()
const mockRange     = jest.fn()
const mockIs        = jest.fn()
const mockLt        = jest.fn()
const mockMaybeSingle = jest.fn()
const mockLimit     = jest.fn()

// Build a chainable query builder mock
function makeChain(terminal: jest.Mock) {
  const chain: any = {}
  const methods = ['select', 'insert', 'update', 'eq', 'in', 'is', 'lt',
                   'order', 'range', 'single', 'maybeSingle', 'limit']
  methods.forEach(m => {
    chain[m] = jest.fn().mockReturnValue(chain)
  })
  chain['single']      = terminal
  chain['maybeSingle'] = mockMaybeSingle
  return chain
}

const queryChain = makeChain(mockSingle)

jest.mock('../../src/config/database', () => ({
  supabase: jest.fn(() => ({
    from: jest.fn().mockReturnValue(queryChain),
  })),
  assertNoError:     jest.fn(),
  assertNoErrorMany: jest.fn(),
}))

import { orderRepository } from '../../src/modules/order/repositories/order.repository'
import { supabase, assertNoError, assertNoErrorMany } from '../../src/config/database'

const mockSupabase    = supabase as jest.MockedFunction<typeof supabase>
const mockAssert      = assertNoError as jest.MockedFunction<typeof assertNoError>
const mockAssertMany  = assertNoErrorMany as jest.MockedFunction<typeof assertNoErrorMany>

// ── Factories ─────────────────────────────────────────────────────────────────

function makeOrderRow(overrides: Record<string, any> = {}) {
  return {
    id:               'order-1',
    buyer_id:         'buyer-1',
    status:           'PENDING_PAYMENT',
    subtotal:         '100.00',
    currency:         'USDT',
    shipping_address: null,
    idempotency_key:  'idem-key-1',
    notes:            null,
    created_at:       new Date().toISOString(),
    updated_at:       new Date().toISOString(),
    ...overrides,
  }
}

function makeOrderItemRow(overrides: Record<string, any> = {}) {
  return {
    id:                    'item-1',
    order_id:              'order-1',
    artwork_id:            'artwork-1',
    seller_id:             'seller-1',
    artwork_title:         'Test Artwork',
    artwork_slug:          'test-artwork',
    artwork_thumbnail_url: null,
    artwork_format:        'DIGITAL',
    unit_price:            '100.00',
    currency:              'USDT',
    quantity:              1,
    line_total:            '100.00',
    variant_snapshot:      null,
    created_at:            new Date().toISOString(),
    ...overrides,
  }
}

function makeTransactionRow(overrides: Record<string, any> = {}) {
  return {
    id:                       'tx-1',
    order_id:                 'order-1',
    status:                   'PENDING',
    amount:                   '100.00',
    currency:                 'USDT',
    network:                  'TRON',
    recipient_wallet_address: 'TWallet',
    sender_wallet_address:    null,
    tx_hash:                  null,
    confirmation_block:       null,
    retry_count:              0,
    last_retry_at:            null,
    expires_at:               new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    confirmed_at:             null,
    created_at:               new Date().toISOString(),
    updated_at:               new Date().toISOString(),
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockAssert.mockReturnValue(undefined)
  mockAssertMany.mockReturnValue(undefined)
})

// ═════════════════════════════════════════════════════════════════════════════
// toOrder mapper — field types
// ═════════════════════════════════════════════════════════════════════════════

describe('orderRepository.findById — domain mapping', () => {
  it('maps DB row fields to correct domain types', async () => {
    queryChain['single'] = jest.fn().mockResolvedValue({ data: makeOrderRow(), error: null })
    queryChain['select'] = jest.fn().mockReturnValue({
      ...queryChain,
      eq:    jest.fn().mockReturnValue({ ...queryChain, single: jest.fn().mockResolvedValue({ data: makeOrderRow(), error: null }), order: jest.fn().mockReturnValue({ data: [makeOrderItemRow()], error: null }) }),
      order: jest.fn().mockReturnValue({ data: [makeOrderItemRow()], error: null }),
    })

    // Use a direct approach — test the mapper via findById with fully controlled responses
    const chain1 = { data: makeOrderRow(), error: null }
    const chain2 = { data: [makeOrderItemRow()], error: null }

    const fromSpy = jest.fn()
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(chain1),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockResolvedValue(chain2),
      })

    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const order = await orderRepository.findById('order-1')

    expect(order).toBeDefined()
    expect(order!.id).toBe('order-1')
    expect(order!.subtotal).toBe(100)           // numeric, not string
    expect(order!.created_at).toBeInstanceOf(Date)
    expect(order!.updated_at).toBeInstanceOf(Date)
    expect(Array.isArray(order!.items)).toBe(true)
  })

  it('returns undefined when order is not found (PGRST116)', async () => {
    const fromSpy = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    })
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const order = await orderRepository.findById('nonexistent')

    expect(order).toBeUndefined()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// toOrderItem mapper
// ═════════════════════════════════════════════════════════════════════════════

describe('orderRepository — order item mapping', () => {
  it('maps order item numeric fields from string to number', async () => {
    const fromSpy = jest.fn()
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: makeOrderRow(), error: null }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockResolvedValue({
          data: [makeOrderItemRow({ unit_price: '99.50', line_total: '99.50', quantity: 1 })],
          error: null,
        }),
      })

    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const order = await orderRepository.findById('order-1')

    expect(order!.items[0]!.unit_price).toBe(99.5)
    expect(order!.items[0]!.line_total).toBe(99.5)
    expect(typeof order!.items[0]!.quantity).toBe('number')
  })

  it('maps variant_snapshot as null when absent', async () => {
    const fromSpy = jest.fn()
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: makeOrderRow(), error: null }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockResolvedValue({
          data: [makeOrderItemRow({ variant_snapshot: null })],
          error: null,
        }),
      })

    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const order = await orderRepository.findById('order-1')

    expect(order!.items[0]!.variant_snapshot).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// toTransaction mapper
// ═════════════════════════════════════════════════════════════════════════════

describe('orderRepository.findTransactionByOrder — transaction mapping', () => {
  it('maps transaction row fields correctly', async () => {
    const txRow = makeTransactionRow({ retry_count: 2 })
    const fromSpy = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: txRow, error: null }),
    })
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const tx = await orderRepository.findTransactionByOrder('order-1')

    expect(tx).toBeDefined()
    expect(tx!.amount).toBe(100)
    expect(tx!.retry_count).toBe(2)
    expect(tx!.expires_at).toBeInstanceOf(Date)
    expect(tx!.confirmed_at).toBeNull()
    expect(tx!.tx_hash).toBeNull()
  })

  it('returns undefined when transaction not found (PGRST116)', async () => {
    const fromSpy = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    })
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const tx = await orderRepository.findTransactionByOrder('no-order')

    expect(tx).toBeUndefined()
  })

  it('maps confirmed_at as Date when present', async () => {
    const confirmedAt = new Date().toISOString()
    const fromSpy = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: makeTransactionRow({ confirmed_at: confirmedAt }),
        error: null,
      }),
    })
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const tx = await orderRepository.findTransactionByOrder('order-1')

    expect(tx!.confirmed_at).toBeInstanceOf(Date)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// findByIdempotencyKey
// ═════════════════════════════════════════════════════════════════════════════

describe('orderRepository.findByIdempotencyKey', () => {
  it('returns undefined gracefully on DB error', async () => {
    const fromSpy = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'SOME_ERROR' } }),
    })
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const result = await orderRepository.findByIdempotencyKey('key', 'buyer-1')

    expect(result).toBeUndefined()
  })

  it('returns undefined when not found (PGRST116)', async () => {
    const fromSpy = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    })
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const result = await orderRepository.findByIdempotencyKey('missing-key', 'buyer-1')

    expect(result).toBeUndefined()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// findTransactionByTxHash
// ═════════════════════════════════════════════════════════════════════════════

describe('orderRepository.findTransactionByTxHash', () => {
  it('returns the transaction when tx_hash matches', async () => {
    const fromSpy = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: makeTransactionRow({ tx_hash: 'a'.repeat(64) }),
        error: null,
      }),
    })
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const tx = await orderRepository.findTransactionByTxHash('a'.repeat(64))

    expect(tx).toBeDefined()
    expect(tx!.tx_hash).toBe('a'.repeat(64))
  })

  it('returns undefined when tx_hash is not found', async () => {
    const fromSpy = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    })
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const result = await orderRepository.findTransactionByTxHash('b'.repeat(64))

    expect(result).toBeUndefined()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// updateTransaction — partial payload
// ═════════════════════════════════════════════════════════════════════════════

describe('orderRepository.updateTransaction', () => {
  it('only includes defined fields in the update payload', async () => {
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: makeTransactionRow({ status: 'CONFIRMING' }), error: null }),
    }
    const fromSpy = jest.fn().mockReturnValue(updateChain)
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    await orderRepository.updateTransaction('tx-1', { status: 'CONFIRMING' })

    const updatePayload = updateChain.update.mock.calls[0]?.[0] as Record<string, any>
    expect(updatePayload['status']).toBe('CONFIRMING')
    // Fields not provided should not appear in the update payload
    expect(updatePayload['tx_hash']).toBeUndefined()
    expect(updatePayload['confirmation_block']).toBeUndefined()
  })

  it('always includes updated_at in the update payload', async () => {
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: makeTransactionRow(), error: null }),
    }
    const fromSpy = jest.fn().mockReturnValue(updateChain)
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    await orderRepository.updateTransaction('tx-1', { retry_count: 1 })

    const updatePayload = updateChain.update.mock.calls[0]?.[0] as Record<string, any>
    expect(updatePayload['updated_at']).toBeDefined()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// appendWalletLedgerEntry
// ═════════════════════════════════════════════════════════════════════════════

describe('orderRepository.appendWalletLedgerEntry', () => {
  it('inserts a ledger entry and returns the mapped record', async () => {
    const ledgerRow = {
      id:             'ledger-1',
      user_id:        'seller-1',
      transaction_id: 'tx-1',
      order_id:       'order-1',
      type:           'CREDIT',
      amount:         '100.00',
      balance_after:  '100.00',
      description:    'Sale',
      created_at:     new Date().toISOString(),
    }

    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: ledgerRow, error: null }),
    }
    const fromSpy = jest.fn().mockReturnValue(insertChain)
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const entry = await orderRepository.appendWalletLedgerEntry({
      user_id:        'seller-1',
      transaction_id: 'tx-1',
      order_id:       'order-1',
      type:           'CREDIT',
      amount:         100,
      balance_after:  100,
      description:    'Sale',
    })

    expect(entry.amount).toBe(100)           // numeric
    expect(entry.balance_after).toBe(100)    // numeric
    expect(entry.type).toBe('CREDIT')
    expect(entry.created_at).toBeInstanceOf(Date)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// getSellerBalance
// ═════════════════════════════════════════════════════════════════════════════

describe('orderRepository.getSellerBalance', () => {
  it('returns the most recent balance_after value', async () => {
    const fromSpy = jest.fn().mockReturnValue({
      select:      jest.fn().mockReturnThis(),
      eq:          jest.fn().mockReturnThis(),
      order:       jest.fn().mockReturnThis(),
      limit:       jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { balance_after: '250.50' }, error: null }),
    })
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const balance = await orderRepository.getSellerBalance('seller-1')

    expect(balance).toBe(250.5)
  })

  it('returns 0 when the seller has no ledger entries', async () => {
    const fromSpy = jest.fn().mockReturnValue({
      select:      jest.fn().mockReturnThis(),
      eq:          jest.fn().mockReturnThis(),
      order:       jest.fn().mockReturnThis(),
      limit:       jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const balance = await orderRepository.getSellerBalance('new-seller')

    expect(balance).toBe(0)
  })

  it('returns 0 on DB error without throwing', async () => {
    const fromSpy = jest.fn().mockReturnValue({
      select:      jest.fn().mockReturnThis(),
      eq:          jest.fn().mockReturnThis(),
      order:       jest.fn().mockReturnThis(),
      limit:       jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    })
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const balance = await orderRepository.getSellerBalance('seller-error')

    expect(balance).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// findExpiredPendingTransactions
// ═════════════════════════════════════════════════════════════════════════════

describe('orderRepository.findExpiredPendingTransactions', () => {
  it('returns an empty array on DB error without throwing', async () => {
    const fromSpy = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      lt:     jest.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } }),
    })
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const result = await orderRepository.findExpiredPendingTransactions()

    expect(result).toEqual([])
  })

  it('returns mapped transactions when expired ones exist', async () => {
    const expiredTx = makeTransactionRow({
      status:     'PENDING',
      expires_at: new Date(Date.now() - 1000).toISOString(),
    })

    const fromSpy = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      lt:     jest.fn().mockResolvedValue({ data: [expiredTx], error: null }),
    })
    ;(supabase as any).mockReturnValue({ from: fromSpy })

    const result = await orderRepository.findExpiredPendingTransactions()

    expect(result).toHaveLength(1)
    expect(result[0]!.status).toBe('PENDING')
    expect(result[0]!.expires_at).toBeInstanceOf(Date)
  })
})