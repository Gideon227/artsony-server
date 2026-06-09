import type {
  Order,
  OrderItem,
  OrderStatus,
  Transaction,
  CheckoutInput,
  CartItemWithArtwork,
} from '../../src/common/types/commerce.types'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../src/modules/order/repositories/order.repository', () => ({
  orderRepository: {
    createWithItems:               jest.fn(),
    findById:                      jest.fn(),
    findByIdempotencyKey:          jest.fn(),
    findByBuyer:                   jest.fn(),
    findBySeller:                  jest.fn(),
    updateStatus:                  jest.fn(),
    findTransactionByOrder:        jest.fn(),
    updateTransaction:             jest.fn(),
    findTransactionByTxHash:       jest.fn(),
    findExpiredPendingTransactions:jest.fn(),
    appendWalletLedgerEntry:       jest.fn(),
    getSellerBalance:              jest.fn(),
  },
}))

jest.mock('../../src/modules/cart/services/cart.service', () => ({
  cartService: {
    validateItemsForCheckout: jest.fn(),
  },
}))

jest.mock('../../src/modules/cart/repositories/cart.repository', () => ({
  cartRepository: {
    deleteItems: jest.fn(),
  },
}))

jest.mock('../../src/modules/artwork/repositories/artwork.repository', () => ({
  artworkRepository: {
    reserveStock: jest.fn(),
    releaseStock:  jest.fn(),
  },
}))

jest.mock('../../src/modules/auth/repositories/user.repository', () => ({
  userRepository: {
    findById: jest.fn(),
  },
}))

jest.mock('../../src/modules/email/email.service', () => ({
  emailService: {
    sendOrderConfirmation: jest.fn(),
  },
}))

jest.mock('../../src/modules/redis/redis.client', () => ({
  redisGet: jest.fn().mockResolvedValue(null),
  redisSet: jest.fn().mockResolvedValue(undefined),
  redisDel: jest.fn().mockResolvedValue(undefined),
}))

// Provide platform wallet env before importing service
process.env['PLATFORM_WALLET_TRON'] = 'TTestWalletAddress123456789012345'

import { orderService } from '../../src/modules/order/services/order.service'
import { orderRepository } from '../../src/modules/order/repositories/order.repository'
import { cartService } from '../../src/modules/cart/services/cart.service'
import { cartRepository } from '../../src/modules/cart/repositories/cart.repository'
import { artworkRepository } from '../../src/modules/artwork/repositories/artwork.repository'
import { userRepository } from '../../src/modules/auth/repositories/user.repository'
import { redisGet } from '../../src/modules/redis/redis.client'
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from '../../src/common/errors'

const mockOrderRepo   = orderRepository   as jest.Mocked<typeof orderRepository>
const mockCartService = cartService       as jest.Mocked<typeof cartService>
const mockCartRepo    = cartRepository    as jest.Mocked<typeof cartRepository>
const mockArtworkRepo = artworkRepository as jest.Mocked<typeof artworkRepository>
const mockUserRepo    = userRepository    as jest.Mocked<typeof userRepository>
const mockRedisGet    = redisGet          as jest.MockedFunction<typeof redisGet>

// ── Factories ─────────────────────────────────────────────────────────────────

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

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id:               'order-1',
    buyer_id:         'buyer-1',
    status:           'PENDING_PAYMENT',
    subtotal:         100,
    currency:         'USDT',
    shipping_address: null,
    idempotency_key:  'idem-key-1',
    notes:            null,
    items:            [makeOrderItem()],
    created_at:       new Date(),
    updated_at:       new Date(),
    ...overrides,
  }
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id:                       'tx-1',
    order_id:                 'order-1',
    status:                   'PENDING',
    amount:                   100,
    currency:                 'USDT',
    network:                  'TRON',
    recipient_wallet_address: 'TTestWalletAddress123456789012345',
    sender_wallet_address:    null,
    tx_hash:                  null,
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

function makeValidatedCartItem(overrides: Partial<CartItemWithArtwork & { effective_price: number }> = {}): CartItemWithArtwork & { effective_price: number } {
  return {
    id:               'cart-item-1',
    user_id:          'buyer-1',
    artwork_id:       'artwork-1',
    quantity:         1,
    price_at_add:     100,
    currency_at_add:  'USDT',
    variant_snapshot: null,
    added_at:         new Date(),
    artwork: {
      id:                   'artwork-1',
      title:                'Test Artwork',
      slug:                 'test-artwork',
      thumbnail_url:        null,
      artwork_format:       'DIGITAL',
      listing_type:         'MARKETPLACE',
      status:               'PUBLISHED',
      moderation_status:    'APPROVED',
      price:                100,
      currency:             'USDT',
      max_purchase_quantity:null,
      has_variants:         false,
      seller_id:            'seller-1',
      seller_name:          'Test Seller',
      seller_avatar_url:    null,
    },
    effective_price:       100,
    is_price_changed:      false,
    is_unavailable:        false,
    is_stock_insufficient: false,
    ...overrides,
  }
}

function makeCheckoutInput(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    cart_item_ids:   ['cart-item-1'],
    idempotency_key: 'a0000000-0000-0000-0000-000000000001',
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockRedisGet.mockResolvedValue(null)
  mockOrderRepo.findByIdempotencyKey.mockResolvedValue(undefined)
  mockOrderRepo.getSellerBalance.mockResolvedValue(0)
  mockOrderRepo.appendWalletLedgerEntry.mockResolvedValue({} as any)
  mockCartRepo.deleteItems.mockResolvedValue(undefined)
  mockArtworkRepo.reserveStock.mockResolvedValue(true)
  mockArtworkRepo.releaseStock.mockResolvedValue(undefined)
  mockUserRepo.findById.mockResolvedValue({ email: 'buyer@test.com' } as any)
})

// ═════════════════════════════════════════════════════════════════════════════
// initiateCheckout
// ═════════════════════════════════════════════════════════════════════════════

describe('orderService.initiateCheckout', () => {
  const defaultOrder = makeOrder()
  const defaultTx    = makeTransaction()

  beforeEach(() => {
    mockCartService.validateItemsForCheckout.mockResolvedValue([makeValidatedCartItem()])
    mockOrderRepo.createWithItems.mockResolvedValue({
      order:       defaultOrder,
      transaction: defaultTx,
    })
  })

  it('creates an order and returns checkout result for a digital artwork', async () => {
    const result = await orderService.initiateCheckout('buyer-1', makeCheckoutInput())

    expect(mockOrderRepo.createWithItems).toHaveBeenCalledWith(
      expect.objectContaining({
        buyer_id:        'buyer-1',
        subtotal:        100,
        currency:        'USDT',
        shipping_address:null,
      }),
    )
    expect(result.order.id).toBe('order-1')
    expect(result.payment_instructions.network).toBe('TRON')
    expect(result.payment_instructions.amount).toBe(100)
  })

  it('returns cached result immediately for duplicate idempotency key', async () => {
    const cachedResult = { order: defaultOrder, payment_instructions: {} }
    mockRedisGet.mockResolvedValue(JSON.stringify(cachedResult))

    const result = await orderService.initiateCheckout('buyer-1', makeCheckoutInput())

    expect(mockCartService.validateItemsForCheckout).not.toHaveBeenCalled()
    expect(mockOrderRepo.createWithItems).not.toHaveBeenCalled()
    expect(result.order.id).toBe('order-1')
  })

  it('returns existing order for duplicate idempotency key found in DB', async () => {
    mockOrderRepo.findByIdempotencyKey.mockResolvedValue(defaultOrder)
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(defaultTx)

    const result = await orderService.initiateCheckout('buyer-1', makeCheckoutInput())

    expect(mockOrderRepo.createWithItems).not.toHaveBeenCalled()
    expect(result.order.id).toBe('order-1')
  })

  it('computes subtotal server-side from effective_price, ignoring price_at_add', async () => {
    const item = makeValidatedCartItem({ price_at_add: 50, effective_price: 120, quantity: 2 })
    mockCartService.validateItemsForCheckout.mockResolvedValue([item])

    await orderService.initiateCheckout('buyer-1', makeCheckoutInput())

    expect(mockOrderRepo.createWithItems).toHaveBeenCalledWith(
      expect.objectContaining({ subtotal: 240 }),
    )
  })

  it('requires shipping_address when order contains a physical artwork', async () => {
    const item = makeValidatedCartItem({
      artwork: {
        ...makeValidatedCartItem().artwork,
        artwork_format: 'PHYSICAL',
      },
    })
    mockCartService.validateItemsForCheckout.mockResolvedValue([item])

    await expect(
      orderService.initiateCheckout('buyer-1', makeCheckoutInput({ shipping_address: undefined })),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('reserves stock for physical artworks before creating order', async () => {
    const item = makeValidatedCartItem({
      artwork: { ...makeValidatedCartItem().artwork, artwork_format: 'PHYSICAL' },
      shipping_address: undefined as any,
    })
    mockCartService.validateItemsForCheckout.mockResolvedValue([item])
    const input = makeCheckoutInput({
      shipping_address: {
        full_name: 'Test User', phone: '1234567890',
        address_line_1: '1 Test St', address_line_2: null,
        city: 'Lagos', state: 'Lagos', postal_code: '100001', country_code: 'NG',
      },
    })

    await orderService.initiateCheckout('buyer-1', input)

    expect(mockArtworkRepo.reserveStock).toHaveBeenCalledWith('artwork-1', 1, undefined)
  })

  it('rolls back all stock reservations when a subsequent reservation fails', async () => {
    const items = [
      makeValidatedCartItem({ id: 'c1', artwork_id: 'a1', artwork: { ...makeValidatedCartItem().artwork, id: 'a1', artwork_format: 'PHYSICAL' } }),
      makeValidatedCartItem({ id: 'c2', artwork_id: 'a2', artwork: { ...makeValidatedCartItem().artwork, id: 'a2', artwork_format: 'PHYSICAL' } }),
    ]
    mockCartService.validateItemsForCheckout.mockResolvedValue(items)
    mockArtworkRepo.reserveStock
      .mockResolvedValueOnce(true)   // first artwork reserves OK
      .mockResolvedValueOnce(false)  // second artwork fails

    const input = makeCheckoutInput({
      cart_item_ids: ['c1', 'c2'],
      shipping_address: {
        full_name: 'Test', phone: '123', address_line_1: '1 St',
        address_line_2: null, city: 'City', state: 'State',
        postal_code: '1000', country_code: 'NG',
      },
    })

    await expect(
      orderService.initiateCheckout('buyer-1', input),
    ).rejects.toMatchObject({ code: 'STOCK_RESERVATION_FAILED' })

    // First artwork's stock must be released
    expect(mockArtworkRepo.releaseStock).toHaveBeenCalledWith('a1', 1, undefined)
  })

  it('rolls back stock and throws ORDER_CREATE_FAILED when DB insert fails', async () => {
    const item = makeValidatedCartItem({
      artwork: { ...makeValidatedCartItem().artwork, artwork_format: 'PHYSICAL' },
    })
    mockCartService.validateItemsForCheckout.mockResolvedValue([item])
    mockOrderRepo.createWithItems.mockRejectedValue(new Error('DB error'))

    const input = makeCheckoutInput({
      shipping_address: {
        full_name: 'Test', phone: '123', address_line_1: '1 St',
        address_line_2: null, city: 'City', state: 'State',
        postal_code: '1000', country_code: 'NG',
      },
    })

    await expect(
      orderService.initiateCheckout('buyer-1', input),
    ).rejects.toMatchObject({ code: 'ORDER_CREATE_FAILED' })

    expect(mockArtworkRepo.releaseStock).toHaveBeenCalled()
  })

  it('throws MIXED_CURRENCY_ORDER when items have different currencies', async () => {
    const items = [
      makeValidatedCartItem({ artwork: { ...makeValidatedCartItem().artwork, currency: 'USDT' } }),
      makeValidatedCartItem({ artwork: { ...makeValidatedCartItem().artwork, currency: 'ETH'  } }),
    ]
    mockCartService.validateItemsForCheckout.mockResolvedValue(items)

    await expect(
      orderService.initiateCheckout('buyer-1', makeCheckoutInput()),
    ).rejects.toMatchObject({ code: 'MIXED_CURRENCY_ORDER' })
  })

  it('clears purchased cart items after successful order creation', async () => {
    mockCartService.validateItemsForCheckout.mockResolvedValue([makeValidatedCartItem()])
    mockOrderRepo.createWithItems.mockResolvedValue({ order: defaultOrder, transaction: defaultTx })

    await orderService.initiateCheckout('buyer-1', makeCheckoutInput())

    expect(mockCartRepo.deleteItems).toHaveBeenCalledWith(['cart-item-1'], 'buyer-1')
  })

  it('does not reserve stock for digital artworks', async () => {
    mockCartService.validateItemsForCheckout.mockResolvedValue([makeValidatedCartItem()])
    mockOrderRepo.createWithItems.mockResolvedValue({ order: defaultOrder, transaction: defaultTx })

    await orderService.initiateCheckout('buyer-1', makeCheckoutInput())

    expect(mockArtworkRepo.reserveStock).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// confirmPayment
// ═════════════════════════════════════════════════════════════════════════════

describe('orderService.confirmPayment', () => {
  const validInput = {
    tx_hash:               'a'.repeat(64),
    sender_wallet_address: 'TSenderWallet123',
    network:               'TRON' as const,
  }

  it('moves transaction to CONFIRMING with tx_hash attached', async () => {
    const order = makeOrder({ status: 'PENDING_PAYMENT', buyer_id: 'buyer-1' })
    const tx    = makeTransaction({ status: 'PENDING' })
    mockOrderRepo.findById.mockResolvedValue(order)
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(tx)
    mockOrderRepo.findTransactionByTxHash.mockResolvedValue(undefined)
    mockOrderRepo.updateTransaction.mockResolvedValue({ ...tx, status: 'CONFIRMING' })

    await orderService.confirmPayment('order-1', 'buyer-1', validInput)

    expect(mockOrderRepo.updateTransaction).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: 'CONFIRMING', tx_hash: 'a'.repeat(64) }),
    )
  })

  it('throws NotFoundError when order does not exist', async () => {
    mockOrderRepo.findById.mockResolvedValue(undefined)

    await expect(
      orderService.confirmPayment('bad-id', 'buyer-1', validInput),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('throws ForbiddenError when requesterId is not the buyer', async () => {
    mockOrderRepo.findById.mockResolvedValue(makeOrder({ buyer_id: 'buyer-1' }))

    await expect(
      orderService.confirmPayment('order-1', 'other-user', validInput),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('throws ORDER_NOT_PENDING_PAYMENT when order is already in PROCESSING', async () => {
    mockOrderRepo.findById.mockResolvedValue(makeOrder({ status: 'PROCESSING' }))

    await expect(
      orderService.confirmPayment('order-1', 'buyer-1', validInput),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_PENDING_PAYMENT' })
  })

  it('throws PAYMENT_ALREADY_SUBMITTED when transaction is already CONFIRMING', async () => {
    mockOrderRepo.findById.mockResolvedValue(makeOrder())
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(
      makeTransaction({ status: 'CONFIRMING' }),
    )

    await expect(
      orderService.confirmPayment('order-1', 'buyer-1', validInput),
    ).rejects.toMatchObject({ code: 'PAYMENT_ALREADY_SUBMITTED' })
  })

  it('throws PAYMENT_WINDOW_EXPIRED when transaction is past expires_at', async () => {
    mockOrderRepo.findById.mockResolvedValue(makeOrder())
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(
      makeTransaction({ status: 'PENDING', expires_at: new Date(Date.now() - 1000) }),
    )

    await expect(
      orderService.confirmPayment('order-1', 'buyer-1', validInput),
    ).rejects.toMatchObject({ code: 'PAYMENT_WINDOW_EXPIRED' })
  })

  it('throws TX_HASH_ALREADY_USED when tx_hash was previously used', async () => {
    mockOrderRepo.findById.mockResolvedValue(makeOrder())
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(makeTransaction())
    mockOrderRepo.findTransactionByTxHash.mockResolvedValue(makeTransaction({ id: 'other-tx' }))

    await expect(
      orderService.confirmPayment('order-1', 'buyer-1', validInput),
    ).rejects.toMatchObject({ code: 'TX_HASH_ALREADY_USED' })
  })

  it('throws ValidationError for invalid tx_hash format (not 64 hex chars)', async () => {
    mockOrderRepo.findById.mockResolvedValue(makeOrder())
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(makeTransaction())
    mockOrderRepo.findTransactionByTxHash.mockResolvedValue(undefined)

    await expect(
      orderService.confirmPayment('order-1', 'buyer-1', {
        ...validInput,
        tx_hash: 'not-a-valid-hash',
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// fulfillOrder
// ═════════════════════════════════════════════════════════════════════════════

describe('orderService.fulfillOrder', () => {
  it('moves all-digital order to FULFILLED', async () => {
    const order = makeOrder({ status: 'PAYMENT_CONFIRMED', items: [makeOrderItem({ artwork_format: 'DIGITAL' })] })
    mockOrderRepo.findById.mockResolvedValue(order)
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(makeTransaction({ status: 'CONFIRMING' }))
    mockOrderRepo.updateTransaction.mockResolvedValue({} as any)
    mockOrderRepo.updateStatus.mockResolvedValue({ ...order, status: 'FULFILLED' })

    const result = await orderService.fulfillOrder('order-1', 12345)

    expect(mockOrderRepo.updateStatus).toHaveBeenCalledWith('order-1', 'FULFILLED')
  })

  it('moves all-physical order to PROCESSING', async () => {
    const order = makeOrder({
      status: 'PAYMENT_CONFIRMED',
      items:  [makeOrderItem({ artwork_format: 'PHYSICAL' })],
    })
    mockOrderRepo.findById.mockResolvedValue(order)
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(makeTransaction({ status: 'CONFIRMING' }))
    mockOrderRepo.updateTransaction.mockResolvedValue({} as any)
    mockOrderRepo.updateStatus.mockResolvedValue({ ...order, status: 'PROCESSING' })

    await orderService.fulfillOrder('order-1', 12345)

    expect(mockOrderRepo.updateStatus).toHaveBeenCalledWith('order-1', 'PROCESSING')
  })

  it('credits wallet ledger for each unique seller', async () => {
    const order = makeOrder({
      status: 'PAYMENT_CONFIRMED',
      items: [
        makeOrderItem({ seller_id: 'seller-1', line_total: 100 }),
        makeOrderItem({ id: 'item-2', seller_id: 'seller-2', line_total: 50 }),
      ],
    })
    mockOrderRepo.findById.mockResolvedValue(order)
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(makeTransaction({ status: 'CONFIRMING' }))
    mockOrderRepo.updateTransaction.mockResolvedValue({} as any)
    mockOrderRepo.updateStatus.mockResolvedValue({ ...order, status: 'FULFILLED' })
    mockOrderRepo.getSellerBalance.mockResolvedValue(0)

    await orderService.fulfillOrder('order-1', 12345)

    expect(mockOrderRepo.appendWalletLedgerEntry).toHaveBeenCalledTimes(2)
    expect(mockOrderRepo.appendWalletLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'seller-1', amount: 100, type: 'CREDIT' }),
    )
    expect(mockOrderRepo.appendWalletLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'seller-2', amount: 50, type: 'CREDIT' }),
    )
  })

  it('throws INVALID_ORDER_TRANSITION when order is not PAYMENT_CONFIRMED', async () => {
    mockOrderRepo.findById.mockResolvedValue(makeOrder({ status: 'PROCESSING' }))

    await expect(
      orderService.fulfillOrder('order-1', 12345),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_TRANSITION' })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// cancelOrder
// ═════════════════════════════════════════════════════════════════════════════

describe('orderService.cancelOrder', () => {
  it('cancels a PENDING_PAYMENT order and releases physical stock', async () => {
    const order = makeOrder({
      status: 'PENDING_PAYMENT',
      items:  [makeOrderItem({ artwork_format: 'PHYSICAL', quantity: 2 })],
    })
    mockOrderRepo.findById.mockResolvedValue(order)
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(makeTransaction({ status: 'PENDING' }))
    mockOrderRepo.updateTransaction.mockResolvedValue({} as any)
    mockOrderRepo.updateStatus.mockResolvedValue({ ...order, status: 'CANCELLED' })

    await orderService.cancelOrder('order-1', 'buyer-1')

    expect(mockArtworkRepo.releaseStock).toHaveBeenCalledWith('artwork-1', 2, undefined)
    expect(mockOrderRepo.updateStatus).toHaveBeenCalledWith('order-1', 'CANCELLED')
  })

  it('does not release stock for digital artworks on cancellation', async () => {
    const order = makeOrder({ status: 'PENDING_PAYMENT', items: [makeOrderItem({ artwork_format: 'DIGITAL' })] })
    mockOrderRepo.findById.mockResolvedValue(order)
    mockOrderRepo.findTransactionByOrder.mockResolvedValue(makeTransaction())
    mockOrderRepo.updateTransaction.mockResolvedValue({} as any)
    mockOrderRepo.updateStatus.mockResolvedValue({ ...order, status: 'CANCELLED' })

    await orderService.cancelOrder('order-1', 'buyer-1')

    expect(mockArtworkRepo.releaseStock).not.toHaveBeenCalled()
  })

  it('throws ForbiddenError when requester is not the buyer', async () => {
    mockOrderRepo.findById.mockResolvedValue(makeOrder({ buyer_id: 'buyer-1' }))

    await expect(
      orderService.cancelOrder('order-1', 'other-user'),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('throws INVALID_ORDER_TRANSITION when order is SHIPPED', async () => {
    mockOrderRepo.findById.mockResolvedValue(makeOrder({ status: 'SHIPPED' }))

    await expect(
      orderService.cancelOrder('order-1', 'buyer-1'),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_TRANSITION' })
  })

  it('throws NotFoundError when order does not exist', async () => {
    mockOrderRepo.findById.mockResolvedValue(undefined)

    await expect(
      orderService.cancelOrder('nonexistent', 'buyer-1'),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// updateOrderStatus
// ═════════════════════════════════════════════════════════════════════════════

describe('orderService.updateOrderStatus', () => {
  it('allows seller to move PROCESSING → SHIPPED', async () => {
    const order = makeOrder({
      status: 'PROCESSING',
      items:  [makeOrderItem({ seller_id: 'seller-1' })],
    })
    mockOrderRepo.findById.mockResolvedValue(order)
    mockOrderRepo.updateStatus.mockResolvedValue({ ...order, status: 'SHIPPED' })

    await orderService.updateOrderStatus('order-1', 'seller-1', 'ARTIST', 'SHIPPED')

    expect(mockOrderRepo.updateStatus).toHaveBeenCalledWith('order-1', 'SHIPPED')
  })

  it('prevents seller from moving order to COMPLETED directly', async () => {
    const order = makeOrder({
      status: 'PROCESSING',
      items:  [makeOrderItem({ seller_id: 'seller-1' })],
    })
    mockOrderRepo.findById.mockResolvedValue(order)

    await expect(
      orderService.updateOrderStatus('order-1', 'seller-1', 'ARTIST', 'COMPLETED'),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('allows admin to move any valid transition', async () => {
    const order = makeOrder({ status: 'SHIPPED' })
    mockOrderRepo.findById.mockResolvedValue(order)
    mockOrderRepo.updateStatus.mockResolvedValue({ ...order, status: 'COMPLETED' })

    await orderService.updateOrderStatus('order-1', 'admin-1', 'ADMIN', 'COMPLETED')

    expect(mockOrderRepo.updateStatus).toHaveBeenCalledWith('order-1', 'COMPLETED')
  })

  it('throws ForbiddenError for a buyer trying to update status', async () => {
    const order = makeOrder({ buyer_id: 'buyer-1', items: [makeOrderItem({ seller_id: 'seller-1' })] })
    mockOrderRepo.findById.mockResolvedValue(order)

    await expect(
      orderService.updateOrderStatus('order-1', 'buyer-1', 'USER', 'SHIPPED'),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('throws INVALID_ORDER_TRANSITION for illegal state change', async () => {
    const order = makeOrder({
      status: 'PROCESSING',
      items:  [makeOrderItem({ seller_id: 'seller-1' })],
    })
    mockOrderRepo.findById.mockResolvedValue(order)

    await expect(
      orderService.updateOrderStatus('order-1', 'admin-1', 'ADMIN', 'REFUNDED'),
    ).rejects.toMatchObject({ code: 'INVALID_ORDER_TRANSITION' })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// getOrder — access control
// ═════════════════════════════════════════════════════════════════════════════

describe('orderService.getOrder', () => {
  it('returns order to the buyer', async () => {
    const order = makeOrder({ buyer_id: 'buyer-1' })
    mockOrderRepo.findById.mockResolvedValue(order)

    const result = await orderService.getOrder('order-1', 'buyer-1')

    expect(result.id).toBe('order-1')
  })

  it('returns order to a seller with an item in it', async () => {
    const order = makeOrder({ buyer_id: 'buyer-1', items: [makeOrderItem({ seller_id: 'seller-1' })] })
    mockOrderRepo.findById.mockResolvedValue(order)

    const result = await orderService.getOrder('order-1', 'seller-1')

    expect(result.id).toBe('order-1')
  })

  it('throws ForbiddenError for a third party with no relation to the order', async () => {
    const order = makeOrder({ buyer_id: 'buyer-1', items: [makeOrderItem({ seller_id: 'seller-1' })] })
    mockOrderRepo.findById.mockResolvedValue(order)

    await expect(
      orderService.getOrder('order-1', 'random-user'),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('throws NotFoundError when order does not exist', async () => {
    mockOrderRepo.findById.mockResolvedValue(undefined)

    await expect(
      orderService.getOrder('nonexistent', 'buyer-1'),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('returns cached order and skips DB when cache is warm', async () => {
    const order = makeOrder({ buyer_id: 'buyer-1' })
    mockRedisGet.mockResolvedValue(JSON.stringify(order))

    await orderService.getOrder('order-1', 'buyer-1')

    expect(mockOrderRepo.findById).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// State machine — ORDER_TRANSITIONS exhaustive check
// ═════════════════════════════════════════════════════════════════════════════

describe('Order state machine — exhaustive transition validation', () => {
  const illegal: Array<[OrderStatus, OrderStatus]> = [
    ['PENDING_PAYMENT', 'PROCESSING'],
    ['PENDING_PAYMENT', 'SHIPPED'],
    ['PENDING_PAYMENT', 'FULFILLED'],
    ['PENDING_PAYMENT', 'COMPLETED'],
    ['PENDING_PAYMENT', 'REFUNDED'],
    ['CANCELLED',       'PENDING_PAYMENT'],
    ['CANCELLED',       'PROCESSING'],
    ['REFUNDED',        'COMPLETED'],
    ['COMPLETED',       'PENDING_PAYMENT'],
    ['SHIPPED',         'CANCELLED'],
    ['FULFILLED',       'CANCELLED'],
  ]

  it.each(illegal)(
    'rejects %s → %s as illegal',
    async (from, to) => {
      const order = makeOrder({ status: from, buyer_id: 'buyer-1', items: [makeOrderItem({ seller_id: 'seller-1' })] })
      mockOrderRepo.findById.mockResolvedValue(order)

      await expect(
        orderService.updateOrderStatus('order-1', 'admin-1', 'ADMIN', to),
      ).rejects.toMatchObject({ code: 'INVALID_ORDER_TRANSITION' })
    },
  )
})

// ═════════════════════════════════════════════════════════════════════════════
// expireStaleOrders
// ═════════════════════════════════════════════════════════════════════════════

describe('orderService.expireStaleOrders', () => {
  it('expires transactions and cancels their orders', async () => {
    const tx    = makeTransaction({ status: 'PENDING', expires_at: new Date(Date.now() - 1000) })
    const order = makeOrder({ status: 'PENDING_PAYMENT' })

    mockOrderRepo.findExpiredPendingTransactions.mockResolvedValue([tx])
    mockOrderRepo.findById.mockResolvedValue(order)
    mockOrderRepo.updateTransaction.mockResolvedValue({} as any)
    mockOrderRepo.updateStatus.mockResolvedValue({ ...order, status: 'CANCELLED' })

    await orderService.expireStaleOrders()

    expect(mockOrderRepo.updateTransaction).toHaveBeenCalledWith(
      'tx-1', expect.objectContaining({ status: 'EXPIRED' }),
    )
    expect(mockOrderRepo.updateStatus).toHaveBeenCalledWith('order-1', 'CANCELLED')
  })

  it('releases physical stock when expiring orders', async () => {
    const tx    = makeTransaction()
    const order = makeOrder({
      status: 'PENDING_PAYMENT',
      items:  [makeOrderItem({ artwork_format: 'PHYSICAL', quantity: 3 })],
    })

    mockOrderRepo.findExpiredPendingTransactions.mockResolvedValue([tx])
    mockOrderRepo.findById.mockResolvedValue(order)
    mockOrderRepo.updateTransaction.mockResolvedValue({} as any)
    mockOrderRepo.updateStatus.mockResolvedValue({ ...order, status: 'CANCELLED' })

    await orderService.expireStaleOrders()

    expect(mockArtworkRepo.releaseStock).toHaveBeenCalledWith('artwork-1', 3, undefined)
  })

  it('continues processing remaining orders if one fails', async () => {
    const tx1 = makeTransaction({ id: 'tx-1', order_id: 'order-1' })
    const tx2 = makeTransaction({ id: 'tx-2', order_id: 'order-2' })

    mockOrderRepo.findExpiredPendingTransactions.mockResolvedValue([tx1, tx2])
    mockOrderRepo.findById
      .mockRejectedValueOnce(new Error('DB error'))   // first fails
      .mockResolvedValueOnce(makeOrder({ id: 'order-2', status: 'PENDING_PAYMENT' }))
    mockOrderRepo.updateTransaction.mockResolvedValue({} as any)
    mockOrderRepo.updateStatus.mockResolvedValue({} as any)

    await expect(orderService.expireStaleOrders()).resolves.toBeUndefined()

    // Second order should still be processed
    expect(mockOrderRepo.updateStatus).toHaveBeenCalledWith('order-2', 'CANCELLED')
  })
})