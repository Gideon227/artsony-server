import { v4 as uuidv4 } from 'uuid'
import { orderRepository } from '../repositories/order.repository'
import { cartRepository } from '@/modules/cart/repositories/cart.repository'
import { cartService } from '@/modules/cart/services/cart.service'
import { artworkRepository } from '@/modules/artwork/repositories/artwork.repository'
import { redisGetJson, redisSetJson, redisDel, RedisKeys, RedisTTL } from '@/modules/redis/redis.client'
import { emailService } from '@/modules/email/email.service'
import { userRepository } from '@/modules/auth/repositories/user.repository'
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from '@/common/errors'
import {
  ORDER_TRANSITIONS,
  TRANSACTION_TRANSITIONS,
} from '@/common/types/commerce.types'
import type {
  Order,
  OrderSummary,
  OrderStatus,
  OrderItem,
  OrderVariantSnapshot,
  CheckoutInput,
  CheckoutResult,
  ConfirmPaymentInput,
  PaymentInstructions,
  PaginatedResult,
  OrderFilters,
  Transaction,
  CartItemWithArtwork,
} from '@/common/types/commerce.types'
import { config } from '@/config'

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYMENT_WINDOW_MINUTES = 30

// Platform wallet address per network. In production these come from env vars.
// They are the addresses buyers send USDT to.
const PLATFORM_WALLETS: Record<string, string> = {
  TRON:     process.env['PLATFORM_WALLET_TRON']     ?? '',
  ETHEREUM: process.env['PLATFORM_WALLET_ETHEREUM'] ?? '',
  BSC:      process.env['PLATFORM_WALLET_BSC']      ?? '',
}

const DEFAULT_NETWORK = 'TRON' as const

// ── Cache helpers ─────────────────────────────────────────────────────────────

function invalidateOrderCache(orderId: string): void {
  void redisDel(RedisKeys.orderById(orderId))
}

// ── State machine guard ───────────────────────────────────────────────────────

function assertTransition(current: OrderStatus, next: OrderStatus): void {
  const allowed = ORDER_TRANSITIONS[current]
  if (!allowed.includes(next)) {
    throw new AppError(
      `Cannot transition order from ${current} to ${next}`,
      422,
      'INVALID_ORDER_TRANSITION',
    )
  }
}

// ── Snapshot builder ──────────────────────────────────────────────────────────
// Converts a validated cart item into the order item insert payload.
// All artwork fields are snapshotted here — nothing is FK-only.

function buildOrderItemPayload(
  item: CartItemWithArtwork & { effective_price: number },
): {
  artwork_id:            string
  seller_id:             string
  artwork_title:         string
  artwork_slug:          string
  artwork_thumbnail_url: string | null
  artwork_format:        'DIGITAL' | 'PHYSICAL'
  unit_price:            number
  currency:              string
  quantity:              number
  variant_snapshot:      OrderVariantSnapshot | null
} {
  let variantSnapshot: OrderVariantSnapshot | null = null

  if (item.variant_snapshot) {
    variantSnapshot = {
      variant_id:     item.variant_snapshot.variant_id,
      variant_type:   item.variant_snapshot.variant_type,
      variant_name:   item.variant_snapshot.variant_name,
      option_id:      item.variant_snapshot.option_id,
      option_label:   item.variant_snapshot.option_label,
      price_modifier: item.variant_snapshot.price_modifier,
      sku:            null, // sku is not in CartVariantSnapshot — carried from the option at validation time
    }
  }

  return {
    artwork_id:            item.artwork_id,
    seller_id:             item.artwork.seller_id,
    artwork_title:         item.artwork.title,
    artwork_slug:          item.artwork.slug,
    artwork_thumbnail_url: item.artwork.thumbnail_url,
    artwork_format:        item.artwork.artwork_format,
    unit_price:            item.effective_price,
    currency:              item.artwork.currency,
    quantity:              item.quantity,
    variant_snapshot:      variantSnapshot,
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export const orderService = {

  // ── initiateCheckout ───────────────────────────────────────────────────────
  // The most complex operation in the entire system. Must be atomic from
  // the buyer's perspective — either an order is fully created or nothing is.

  async initiateCheckout(
    buyerId: string,
    input: CheckoutInput,
  ): Promise<CheckoutResult> {
    // ── 1. Idempotency check ─────────────────────────────────────────────────
    // Return the cached result immediately if this key was already processed.
    // Prevents double orders from retried requests (network failures, etc.)
    const cachedResult = await redisGetJson<CheckoutResult>(RedisKeys.orderIdempotent(input.idempotency_key))
    if (cachedResult) return cachedResult

    // Check DB as secondary idempotency gate (cache may have expired)
    const existingOrder = await orderRepository.findByIdempotencyKey(
      input.idempotency_key,
      buyerId,
    )
    if (existingOrder) {
      const existingTx = await orderRepository.findTransactionByOrder(existingOrder.id)
      if (existingTx) {
        const result: CheckoutResult = {
          order: existingOrder,
          payment_instructions: {
            transaction_id:           existingTx.id,
            recipient_wallet_address: existingTx.recipient_wallet_address,
            amount:                   existingTx.amount,
            currency:                 existingTx.currency,
            network:                  existingTx.network,
            expires_at:               existingTx.expires_at,
          },
        }
        return result
      }
    }

    // ── 2. Validate cart items ─────────────────────────────────────────────
    // This is the point of no return — after this, prices and stock are locked.
    const validatedItems = await cartService.validateItemsForCheckout(
      buyerId,
      input.cart_item_ids,
    )

    // ── 3. Determine order format mix ─────────────────────────────────────
    const hasPhysical = validatedItems.some(i => i.artwork.artwork_format === 'PHYSICAL')

    // Physical orders require a shipping address
    if (hasPhysical && !input.shipping_address) {
      throw new ValidationError('Validation failed', {
        shipping_address: 'A shipping address is required for orders containing physical artworks',
      })
    }

    // ── 4. Validate all items share same currency ──────────────────────────
    const currencies = new Set(validatedItems.map(i => i.artwork.currency))
    if (currencies.size > 1) {
      throw new AppError(
        'All items in a single order must share the same currency',
        422,
        'MIXED_CURRENCY_ORDER',
      )
    }

    const currency = validatedItems[0]!.artwork.currency

    // ── 5. Server-side total computation ──────────────────────────────────
    // Client-provided prices are completely ignored.
    const subtotal = validatedItems.reduce(
      (sum, item) => sum + item.effective_price * item.quantity,
      0,
    )
    const roundedSubtotal = Math.round(subtotal * 100) / 100

    // ── 6. Reserve stock atomically for physical artworks ─────────────────
    const reservations: Array<{ artworkId: string; quantity: number; variantOptionId: string | undefined }> = []

    for (const item of validatedItems) {
      if (item.artwork.artwork_format === 'PHYSICAL') {
        const optionId = item.variant_snapshot?.option_id
        const reserved = await artworkRepository.reserveStock(
          item.artwork_id,
          item.quantity,
          optionId,
        )
        if (!reserved) {
          // Roll back all previously reserved stock before throwing
          for (const r of reservations) {
            await artworkRepository.releaseStock(r.artworkId, r.quantity, r.variantOptionId)
          }
          throw new AppError(
            `Stock reservation failed for "${item.artwork.title}"`,
            422,
            'STOCK_RESERVATION_FAILED',
          )
        }
        reservations.push({ artworkId: item.artwork_id, quantity: item.quantity, variantOptionId: optionId })
      }
    }

    // ── 7. Determine payment network & wallet address ──────────────────────
    const network         = DEFAULT_NETWORK
    const walletAddress   = PLATFORM_WALLETS[network]

    if (!walletAddress) {
      // Roll back stock reservations before throwing
      for (const r of reservations) {
        await artworkRepository.releaseStock(r.artworkId, r.quantity, r.variantOptionId)
      }
      throw new AppError(
        'Payment processing is temporarily unavailable',
        503,
        'PAYMENT_UNAVAILABLE',
      )
    }

    const expiresAt = new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000)

    // ── 8. Create order + items + transaction in sequence ─────────────────
    let created: { order: Order; transaction: Transaction }
    try {
      created = await orderRepository.createWithItems({
        buyer_id:         buyerId,
        subtotal:         roundedSubtotal,
        currency,
        shipping_address: input.shipping_address ?? null,
        idempotency_key:  input.idempotency_key,
        notes:            input.notes ?? null,
        items:            validatedItems.map(buildOrderItemPayload),
        transaction: {
          amount:                   roundedSubtotal,
          currency,
          network,
          recipient_wallet_address: walletAddress,
          expires_at:               expiresAt,
        },
      })
    } catch (err: any) {
      // Roll back stock on any DB failure
      for (const r of reservations) {
        await artworkRepository.releaseStock(r.artworkId, r.quantity, r.variantOptionId)
      }
      // Re-throw with context
      throw new AppError(
        'Order creation failed. Please try again.',
        500,
        'ORDER_CREATE_FAILED',
      )
    }

    // ── 9. Clear purchased cart items ──────────────────────────────────────
    await cartRepository.deleteItems(input.cart_item_ids, buyerId)

    // ── 10. Build result and cache for idempotency ─────────────────────────
    const paymentInstructions: PaymentInstructions = {
      transaction_id:           created.transaction.id,
      recipient_wallet_address: created.transaction.recipient_wallet_address,
      amount:                   created.transaction.amount,
      currency:                 created.transaction.currency,
      network:                  created.transaction.network,
      expires_at:               created.transaction.expires_at,
    }

    const result: CheckoutResult = { order: created.order, payment_instructions: paymentInstructions }

    // Cache the idempotency result for 25 min (order expires in 30)
    void redisSetJson(RedisKeys.orderIdempotent(input.idempotency_key), result, 25 * 60)

    return result
  },

  // ── confirmPayment ─────────────────────────────────────────────────────────
  // Called when the buyer submits their blockchain transaction hash.
  // Moves the transaction to CONFIRMING — the background job completes it.

  async confirmPayment(
    orderId: string,
    buyerId: string,
    input: ConfirmPaymentInput,
  ): Promise<{ order: Order; payment_instructions: PaymentInstructions }> {
    const order = await orderRepository.findById(orderId)
    if (!order) throw new NotFoundError('Order')
    if (order.buyer_id !== buyerId) throw new ForbiddenError()

    if (order.status !== 'PENDING_PAYMENT') {
      throw new AppError(
        'This order is no longer awaiting payment',
        422,
        'ORDER_NOT_PENDING_PAYMENT',
      )
    }

    const tx = await orderRepository.findTransactionByOrder(orderId)
    if (!tx) throw new AppError('Transaction not found', 500, 'TRANSACTION_NOT_FOUND')

    if (tx.status !== 'PENDING') {
      throw new AppError(
        'Payment for this order has already been submitted',
        409,
        'PAYMENT_ALREADY_SUBMITTED',
      )
    }

    // Guard: transaction must not be expired
    if (new Date() > tx.expires_at) {
      throw new AppError(
        'The payment window for this order has expired. Please create a new order.',
        422,
        'PAYMENT_WINDOW_EXPIRED',
      )
    }

    // Replay attack prevention — tx_hash must be globally unique
    const duplicate = await orderRepository.findTransactionByTxHash(input.tx_hash)
    if (duplicate) {
      throw new AppError(
        'This transaction hash has already been submitted',
        409,
        'TX_HASH_ALREADY_USED',
      )
    }

    // Validate tx_hash format — basic hex check (64 chars for ETH/BSC, 64 for TRON)
    if (!/^[a-fA-F0-9]{64}$/.test(input.tx_hash)) {
      throw new ValidationError('Validation failed', {
        tx_hash: 'Invalid transaction hash format',
      })
    }

    // Move transaction to CONFIRMING — the blockchain verifier job takes it from here
    const updatedTx = await orderRepository.updateTransaction(tx.id, {
      status:                'CONFIRMING',
      sender_wallet_address: input.sender_wallet_address,
      tx_hash:               input.tx_hash,
    })

    // Enqueue first verification check — fire and forget
    // Dynamic import to avoid circular dependency (jobs → service → jobs)
    import('../../payment/jobs/payment.job.js').then(({ scheduleVerification }) => {
      void scheduleVerification(updatedTx.id, 0)
    }).catch(() => {
      // Job scheduling failure must never fail the HTTP response
    })

    invalidateOrderCache(orderId)

    return {
      order,
      payment_instructions: {
        transaction_id:           updatedTx.id,
        recipient_wallet_address: updatedTx.recipient_wallet_address,
        amount:                   updatedTx.amount,
        currency:                 updatedTx.currency,
        network:                  updatedTx.network,
        expires_at:               updatedTx.expires_at,
      },
    }
  },

  // ── fulfillOrder ───────────────────────────────────────────────────────────
  // Called by the blockchain verifier job after on-chain confirmation.
  // Not exposed via HTTP — internal use only.

  async fulfillOrder(orderId: string, confirmationBlock: number): Promise<Order> {
    const order = await orderRepository.findById(orderId)
    if (!order) throw new NotFoundError('Order')

    assertTransition(order.status, 'PAYMENT_CONFIRMED')

    const tx = await orderRepository.findTransactionByOrder(orderId)
    if (!tx) throw new AppError('Transaction not found', 500, 'TRANSACTION_NOT_FOUND')

    // Mark transaction confirmed
    await orderRepository.updateTransaction(tx.id, {
      status:             'CONFIRMED',
      confirmation_block: confirmationBlock,
      confirmed_at:       new Date(),
    })

    // Determine fulfillment path
    const hasPhysical = order.items.some(i => i.artwork_format === 'PHYSICAL')
    const hasDigital  = order.items.some(i => i.artwork_format === 'DIGITAL')

    let nextStatus: OrderStatus

    if (hasPhysical && !hasDigital) {
      // All physical — moves to PROCESSING, seller handles shipping
      nextStatus = 'PROCESSING'
    } else if (!hasPhysical && hasDigital) {
      // All digital — instant fulfillment
      nextStatus = 'FULFILLED'
    } else {
      // Mixed — treat as physical flow (seller ships, digital items included)
      nextStatus = 'PROCESSING'
    }

    assertTransition('PAYMENT_CONFIRMED', nextStatus)
    const updated = await orderRepository.updateStatus(orderId, nextStatus)

    // Generate download tokens for digital items (fire and forget — buyer
    // can retrieve them from GET /api/delivery/my-downloads)
    if (hasDigital) {
      import('../../delivery/services/delivery.service.js').then(({ deliveryService }) => {
        void deliveryService.generateTokensForOrder(orderId, order.buyer_id)
      }).catch(() => {})
    }

    // Credit wallet ledger for each unique seller
    const sellerTotals = new Map<string, number>()
    for (const item of order.items) {
      const current = sellerTotals.get(item.seller_id) ?? 0
      sellerTotals.set(item.seller_id, current + item.line_total)
    }

    for (const [sellerId, amount] of sellerTotals) {
      const currentBalance = await orderRepository.getSellerBalance(sellerId)
      await orderRepository.appendWalletLedgerEntry({
        user_id:        sellerId,
        transaction_id: tx.id,
        order_id:       orderId,
        type:           'CREDIT',
        amount,
        balance_after:  currentBalance + amount,
        description:    `Sale from order #${orderId.slice(0, 8)}`,
      })
    }

    // Queue buyer confirmation email (fire and forget — never blocks order fulfillment)
    void this.sendOrderConfirmationEmail(order)

    invalidateOrderCache(orderId)
    return updated
  },

  // ── cancelOrder ────────────────────────────────────────────────────────────

  async cancelOrder(orderId: string, requesterId: string): Promise<Order> {
    const order = await orderRepository.findById(orderId)
    if (!order) throw new NotFoundError('Order')

    // Only buyer can cancel, and only from cancellable states
    if (order.buyer_id !== requesterId) throw new ForbiddenError()
    assertTransition(order.status, 'CANCELLED')

    // Release reserved stock for physical items
    for (const item of order.items) {
      if (item.artwork_format === 'PHYSICAL') {
        const optionId = item.variant_snapshot?.option_id
        await artworkRepository.releaseStock(item.artwork_id, item.quantity, optionId)
      }
    }

    // Expire the transaction if still pending
    const tx = await orderRepository.findTransactionByOrder(orderId)
    if (tx && (tx.status === 'PENDING' || tx.status === 'CONFIRMING')) {
      await orderRepository.updateTransaction(tx.id, { status: 'EXPIRED' } as any)
    }

    const updated = await orderRepository.updateStatus(orderId, 'CANCELLED')
    invalidateOrderCache(orderId)
    return updated
  },

  // ── updateOrderStatus ──────────────────────────────────────────────────────
  // Used by sellers (PROCESSING → SHIPPED) and admins (any allowed transition).

  async updateOrderStatus(
    orderId: string,
    requesterId: string,
    requesterRole: string,
    nextStatus: OrderStatus,
  ): Promise<Order> {
    const order = await orderRepository.findById(orderId)
    if (!order) throw new NotFoundError('Order')

    const isAdmin  = requesterRole === 'ADMIN'
    const isSeller = order.items.some(i => i.seller_id === requesterId)

    if (!isAdmin && !isSeller) throw new ForbiddenError()

    // Sellers can only move PROCESSING → SHIPPED
    if (!isAdmin && isSeller) {
      if (order.status !== 'PROCESSING' || nextStatus !== 'SHIPPED') {
        throw new ForbiddenError('Sellers can only mark processing orders as shipped')
      }
    }

    assertTransition(order.status, nextStatus)
    const updated = await orderRepository.updateStatus(orderId, nextStatus)
    invalidateOrderCache(orderId)
    return updated
  },

  // ── getOrder ───────────────────────────────────────────────────────────────

  async getOrder(orderId: string, requesterId: string): Promise<Order> {
    const cached = await redisGetJson<Order>(RedisKeys.orderById(orderId))
    if (cached) {
      assertOrderAccess(cached, requesterId)
      return cached
    }

    const order = await orderRepository.findById(orderId)
    if (!order) throw new NotFoundError('Order')

    assertOrderAccess(order, requesterId)

    void redisSetJson(RedisKeys.orderById(orderId), order, RedisTTL.orderSingle)
    return order
  },

  // ── getBuyerOrders ─────────────────────────────────────────────────────────

  async getBuyerOrders(
    buyerId: string,
    filters: OrderFilters,
  ): Promise<PaginatedResult<OrderSummary>> {
    return orderRepository.findByBuyer(buyerId, filters)
  },

  // ── getSellerOrders ────────────────────────────────────────────────────────

  async getSellerOrders(
    sellerId: string,
    filters: OrderFilters,
  ): Promise<PaginatedResult<OrderSummary>> {
    return orderRepository.findBySeller(sellerId, filters)
  },

  // ── expireStaleOrders ──────────────────────────────────────────────────────
  // Called by the background job every 5 minutes. Finds all transactions
  // that have expired and cancels their orders + releases stock.

  async expireStaleOrders(): Promise<void> {
    const expired = await orderRepository.findExpiredPendingTransactions()

    for (const tx of expired) {
      try {
        await orderRepository.updateTransaction(tx.id, { status: 'EXPIRED' } as any)
        const order = await orderRepository.findById(tx.order_id)
        if (!order || order.status !== 'PENDING_PAYMENT') continue

        for (const item of order.items) {
          if (item.artwork_format === 'PHYSICAL') {
            await artworkRepository.releaseStock(
              item.artwork_id,
              item.quantity,
              item.variant_snapshot?.option_id,
            )
          }
        }

        await orderRepository.updateStatus(tx.order_id, 'CANCELLED')
        invalidateOrderCache(tx.order_id)
      } catch {
        // Log and continue — one failure must not block others
        console.error(`[OrderExpiry] Failed to expire order for transaction ${tx.id}`)
      }
    }
  },

  // ── sendOrderConfirmationEmail ─────────────────────────────────────────────
  // Fire-and-forget. Never awaited at the call site.

  async sendOrderConfirmationEmail(order: Order): Promise<void> {
    try {
      const buyer = await userRepository.findById(order.buyer_id)
      if (!buyer) return

      const itemLines = order.items
        .map(i => `${i.artwork_title} × ${i.quantity} — ${i.currency} ${i.unit_price.toFixed(2)}`)
        .join('\n')

      await emailService.sendOrderConfirmation({
        to:      buyer.email,
        orderId: order.id,
        items:   order.items,
        total:   order.subtotal,
        currency:order.currency,
      })
    } catch {
      // Email failure must never propagate — orders continue without it
    }
  },
}

// ── Access guard ──────────────────────────────────────────────────────────────
// An order is readable by its buyer or any seller with an item in it.

function assertOrderAccess(order: Order, requesterId: string): void {
  const isBuyer  = order.buyer_id === requesterId
  const isSeller = order.items.some(i => i.seller_id === requesterId)
  if (!isBuyer && !isSeller) throw new ForbiddenError()
}