"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderService = void 0;
const order_repository_1 = require("../repositories/order.repository");
const cart_repository_1 = require("../../../modules/cart/repositories/cart.repository");
const cart_service_1 = require("../../../modules/cart/services/cart.service");
const artwork_repository_1 = require("../../../modules/artwork/repositories/artwork.repository");
const shipping_address_repository_1 = require("../../../modules/shipping-address/repositories/shipping-address.repository");
const shipping_address_service_1 = require("../../../modules/shipping-address/services/shipping-address.service");
const redis_client_1 = require("../../../modules/redis/redis.client");
const email_service_1 = require("../../../modules/email/email.service");
const user_repository_1 = require("../../../modules/auth/repositories/user.repository");
const errors_1 = require("../../../common/errors");
const commerce_types_1 = require("../../../common/types/commerce.types");
// ── Constants ─────────────────────────────────────────────────────────────────
const PAYMENT_WINDOW_MINUTES = 30;
// Platform wallet address per network. In production these come from env vars.
// They are the addresses buyers send USDT to.
const PLATFORM_WALLETS = {
    TRON: process.env['PLATFORM_WALLET_TRON'] ?? '',
    ETHEREUM: process.env['PLATFORM_WALLET_ETHEREUM'] ?? '',
    BSC: process.env['PLATFORM_WALLET_BSC'] ?? '',
};
const DEFAULT_NETWORK = 'TRON';
// Once the buyer submits a tx_hash (status -> CONFIRMING), the original
// PAYMENT_WINDOW_MINUTES deadline no longer applies — funds may already be
// in flight on-chain. This window is measured from submission time instead,
// giving slow-confirming networks room without auto-cancelling a paid order.
const CONFIRMATION_WINDOW_MINUTES = 60;
// ── Error helpers ─────────────────────────────────────────────────────────────
function hasErrorCode(err) {
    return typeof err === 'object' && err !== null && 'code' in err;
}
async function releaseAllStock(reservations) {
    for (const r of reservations) {
        try {
            await artwork_repository_1.artworkRepository.releaseStock(r.artworkId, r.quantity, r.variantOptionId);
        }
        catch (err) {
            // One failed release must not abandon the rest of the rollback —
            // log and continue so every other reservation still gets released.
            console.error(`[order.releaseAllStock] Failed to release stock for artwork ${r.artworkId}`, err);
        }
    }
}
// ── Cache helpers ─────────────────────────────────────────────────────────────
function invalidateOrderCache(orderId) {
    void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.orderById(orderId));
}
// ── State machine guard ───────────────────────────────────────────────────────
function assertTransition(current, next) {
    const allowed = commerce_types_1.ORDER_TRANSITIONS[current];
    if (!allowed.includes(next)) {
        throw new errors_1.AppError(`Cannot transition order from ${current} to ${next}`, 422, 'INVALID_ORDER_TRANSITION');
    }
}
// ── Snapshot builder ──────────────────────────────────────────────────────────
// Converts a validated cart item into the order item insert payload.
// All artwork fields are snapshotted here — nothing is FK-only.
function buildOrderItemPayload(item) {
    let variantSnapshot = null;
    if (item.variant_snapshot) {
        variantSnapshot = {
            variant_id: item.variant_snapshot.variant_id,
            variant_type: item.variant_snapshot.variant_type,
            variant_name: item.variant_snapshot.variant_name,
            option_id: item.variant_snapshot.option_id,
            option_label: item.variant_snapshot.option_label,
            price_modifier: item.variant_snapshot.price_modifier,
            sku: null, // sku is not in CartVariantSnapshot — carried from the option at validation time
        };
    }
    return {
        artwork_id: item.artwork_id,
        seller_id: item.artwork.seller_id,
        artwork_title: item.artwork.title,
        artwork_slug: item.artwork.slug,
        artwork_thumbnail_url: item.artwork.thumbnail_url,
        artwork_format: item.artwork.artwork_format,
        unit_price: item.effective_price,
        currency: item.artwork.currency,
        quantity: item.quantity,
        variant_snapshot: variantSnapshot,
    };
}
// ── Service ───────────────────────────────────────────────────────────────────
exports.orderService = {
    // ── initiateCheckout ───────────────────────────────────────────────────────
    // The most complex operation in the entire system. Must be atomic from
    // the buyer's perspective — either an order is fully created or nothing is.
    async initiateCheckout(buyerId, input) {
        // ── 1. Idempotency check ─────────────────────────────────────────────────
        // Return the cached result immediately if this key was already processed.
        // Prevents double orders from retried requests (network failures, etc.)
        const cachedResult = await (0, redis_client_1.redisGetJson)(redis_client_1.RedisKeys.orderIdempotent(input.idempotency_key));
        if (cachedResult)
            return cachedResult;
        // Check DB as secondary idempotency gate (cache may have expired)
        const existingOrder = await order_repository_1.orderRepository.findByIdempotencyKey(input.idempotency_key, buyerId);
        if (existingOrder) {
            const existingTx = await order_repository_1.orderRepository.findTransactionByOrder(existingOrder.id);
            if (existingTx) {
                const result = {
                    order: existingOrder,
                    payment_instructions: {
                        transaction_id: existingTx.id,
                        recipient_wallet_address: existingTx.recipient_wallet_address,
                        amount: existingTx.amount,
                        currency: existingTx.currency,
                        network: existingTx.network,
                        expires_at: existingTx.expires_at,
                    },
                };
                return result;
            }
        }
        // ── 2. Validate cart items ─────────────────────────────────────────────
        // This is the point of no return — after this, prices and stock are locked.
        const validatedItems = await cart_service_1.cartService.validateItemsForCheckout(buyerId, input.cart_item_ids);
        // ── 3. Determine order format mix ─────────────────────────────────────
        const hasPhysical = validatedItems.some(i => i.artwork.artwork_format === 'PHYSICAL');
        if (input.shipping_address_id && input.shipping_address) {
            throw new errors_1.ValidationError('Validation failed', {
                shipping_address: 'Provide either shipping_address_id or shipping_address, not both',
            });
        }
        // Resolve the shipping address snapshot to store on the order: either
        // from the buyer's saved address book, or a one-off inline address.
        // The order always stores a plain snapshot — the saved-address table
        // is convenience only, never the order's source of truth (see
        // shipping_addresses comment in 20240301000000_commerce_schema.sql).
        let resolvedShippingAddress = null;
        if (input.shipping_address_id) {
            const saved = await shipping_address_repository_1.shippingAddressRepository.findById(input.shipping_address_id, buyerId);
            if (!saved) {
                throw new errors_1.ValidationError('Validation failed', {
                    shipping_address_id: 'Shipping address not found',
                });
            }
            resolvedShippingAddress = {
                full_name: saved.full_name,
                phone: saved.phone,
                address_line_1: saved.address_line_1,
                address_line_2: saved.address_line_2,
                city: saved.city,
                state: saved.state,
                postal_code: saved.postal_code,
                country_code: saved.country_code,
            };
        }
        else if (input.shipping_address) {
            resolvedShippingAddress = input.shipping_address;
        }
        // Physical orders require a shipping address
        if (hasPhysical && !resolvedShippingAddress) {
            throw new errors_1.ValidationError('Validation failed', {
                shipping_address: 'A shipping address is required for orders containing physical artworks',
            });
        }
        // ── 4. Validate all items share same currency ──────────────────────────
        const currencies = new Set(validatedItems.map(i => i.artwork.currency));
        if (currencies.size > 1) {
            throw new errors_1.AppError('All items in a single order must share the same currency', 422, 'MIXED_CURRENCY_ORDER');
        }
        const currency = validatedItems[0].artwork.currency;
        // ── 5. Server-side total computation ──────────────────────────────────
        // Client-provided prices are completely ignored.
        const subtotal = validatedItems.reduce((sum, item) => sum + item.effective_price * item.quantity, 0);
        const roundedSubtotal = Math.round(subtotal * 100) / 100;
        // ── 6. Reserve stock atomically for physical artworks ─────────────────
        const reservations = [];
        for (const item of validatedItems) {
            if (item.artwork.artwork_format === 'PHYSICAL') {
                const optionId = item.variant_snapshot?.option_id;
                const reserved = await artwork_repository_1.artworkRepository.reserveStock(item.artwork_id, item.quantity, optionId);
                if (!reserved) {
                    // Roll back all previously reserved stock before throwing
                    await releaseAllStock(reservations);
                    throw new errors_1.AppError(`Stock reservation failed for "${item.artwork.title}"`, 422, 'STOCK_RESERVATION_FAILED');
                }
                reservations.push({ artworkId: item.artwork_id, quantity: item.quantity, variantOptionId: optionId });
            }
        }
        // ── 7. Determine payment network & wallet address ──────────────────────
        const network = DEFAULT_NETWORK;
        const walletAddress = PLATFORM_WALLETS[network];
        if (!walletAddress) {
            // Roll back stock reservations before throwing
            await releaseAllStock(reservations);
            throw new errors_1.AppError('Payment processing is temporarily unavailable', 503, 'PAYMENT_UNAVAILABLE');
        }
        const expiresAt = new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000);
        // ── 8. Create order + items + transaction in sequence ─────────────────
        let created;
        try {
            created = await order_repository_1.orderRepository.createWithItems({
                buyer_id: buyerId,
                subtotal: roundedSubtotal,
                currency,
                shipping_address: resolvedShippingAddress,
                idempotency_key: input.idempotency_key,
                notes: input.notes ?? null,
                items: validatedItems.map(buildOrderItemPayload),
                transaction: {
                    amount: roundedSubtotal,
                    currency,
                    network,
                    recipient_wallet_address: walletAddress,
                    expires_at: expiresAt,
                },
            });
        }
        catch (err) {
            // Stock this request reserved is no longer needed — either another
            // concurrent request already won (see below) or creation genuinely
            // failed. Either way it must be released.
            await releaseAllStock(reservations);
            // A 23505 on orders.idempotency_key means a concurrent request with
            // the same key already committed its order first. That request
            // succeeded — this one should return that same order, not a 500.
            if (hasErrorCode(err) && err.code === '23505') {
                const winningOrder = await order_repository_1.orderRepository.findByIdempotencyKey(input.idempotency_key, buyerId);
                const winningTx = winningOrder ? await order_repository_1.orderRepository.findTransactionByOrder(winningOrder.id) : undefined;
                if (winningOrder && winningTx) {
                    const result = {
                        order: winningOrder,
                        payment_instructions: {
                            transaction_id: winningTx.id,
                            recipient_wallet_address: winningTx.recipient_wallet_address,
                            amount: winningTx.amount,
                            currency: winningTx.currency,
                            network: winningTx.network,
                            expires_at: winningTx.expires_at,
                        },
                    };
                    return result;
                }
            }
            // Re-throw with context
            throw new errors_1.AppError('Order creation failed. Please try again.', 500, 'ORDER_CREATE_FAILED');
        }
        // ── 9. Clear purchased cart items ──────────────────────────────────────
        await cart_repository_1.cartRepository.deleteItems(input.cart_item_ids, buyerId);
        // The order is already created and paid-for-verification at this point —
        // saving the address for next time is a convenience, not part of the
        // checkout contract, so a failure here must never fail the response.
        if (input.save_address && !input.shipping_address_id && resolvedShippingAddress) {
            shipping_address_service_1.shippingAddressService
                .create(buyerId, { ...resolvedShippingAddress, label: null, is_default: false })
                .catch(err => {
                console.error('[order.initiateCheckout] Failed to save shipping address', err);
            });
        }
        // ── 10. Build result and cache for idempotency ─────────────────────────
        const paymentInstructions = {
            transaction_id: created.transaction.id,
            recipient_wallet_address: created.transaction.recipient_wallet_address,
            amount: created.transaction.amount,
            currency: created.transaction.currency,
            network: created.transaction.network,
            expires_at: created.transaction.expires_at,
        };
        const result = { order: created.order, payment_instructions: paymentInstructions };
        // Cache the idempotency result for 25 min (order expires in 30)
        void (0, redis_client_1.redisSetJson)(redis_client_1.RedisKeys.orderIdempotent(input.idempotency_key), result, 25 * 60);
        return result;
    },
    // ── confirmPayment ─────────────────────────────────────────────────────────
    // Called when the buyer submits their blockchain transaction hash.
    // Moves the transaction to CONFIRMING — the background job completes it.
    async confirmPayment(orderId, buyerId, input) {
        const order = await order_repository_1.orderRepository.findById(orderId);
        if (!order)
            throw new errors_1.NotFoundError('Order');
        if (order.buyer_id !== buyerId)
            throw new errors_1.ForbiddenError();
        if (order.status !== 'PENDING_PAYMENT') {
            throw new errors_1.AppError('This order is no longer awaiting payment', 422, 'ORDER_NOT_PENDING_PAYMENT');
        }
        const tx = await order_repository_1.orderRepository.findTransactionByOrder(orderId);
        if (!tx)
            throw new errors_1.AppError('Transaction not found', 500, 'TRANSACTION_NOT_FOUND');
        if (tx.status !== 'PENDING') {
            throw new errors_1.AppError('Payment for this order has already been submitted', 409, 'PAYMENT_ALREADY_SUBMITTED');
        }
        // Guard: transaction must not be expired
        if (new Date() > tx.expires_at) {
            throw new errors_1.AppError('The payment window for this order has expired. Please create a new order.', 422, 'PAYMENT_WINDOW_EXPIRED');
        }
        // Replay attack prevention — tx_hash must be globally unique
        const duplicate = await order_repository_1.orderRepository.findTransactionByTxHash(input.tx_hash);
        if (duplicate) {
            throw new errors_1.AppError('This transaction hash has already been submitted', 409, 'TX_HASH_ALREADY_USED');
        }
        // Validate tx_hash format — basic hex check (64 chars for ETH/BSC, 64 for TRON)
        if (!/^[a-fA-F0-9]{64}$/.test(input.tx_hash)) {
            throw new errors_1.ValidationError('Validation failed', {
                tx_hash: 'Invalid transaction hash format',
            });
        }
        // Move transaction to CONFIRMING — the blockchain verifier job takes it from here.
        // Proof of payment has now been submitted, so the original checkout-window
        // deadline no longer applies (funds may already be in flight on-chain).
        // Push expires_at out to a separate, longer confirmation grace window so
        // a slow-confirming network doesn't get the order auto-cancelled out from
        // under a buyer who already paid.
        const updatedTx = await order_repository_1.orderRepository.updateTransaction(tx.id, {
            status: 'CONFIRMING',
            sender_wallet_address: input.sender_wallet_address,
            tx_hash: input.tx_hash,
            expires_at: new Date(Date.now() + CONFIRMATION_WINDOW_MINUTES * 60 * 1000),
        });
        // Enqueue first verification check — fire and forget
        // Dynamic import to avoid circular dependency (jobs → service → jobs)
        import('../../payment/jobs/payment.job.js').then(({ scheduleVerification }) => {
            void scheduleVerification(updatedTx.id, 0);
        }).catch(() => {
            // Job scheduling failure must never fail the HTTP response
        });
        invalidateOrderCache(orderId);
        return {
            order,
            payment_instructions: {
                transaction_id: updatedTx.id,
                recipient_wallet_address: updatedTx.recipient_wallet_address,
                amount: updatedTx.amount,
                currency: updatedTx.currency,
                network: updatedTx.network,
                expires_at: updatedTx.expires_at,
            },
        };
    },
    // ── fulfillOrder ───────────────────────────────────────────────────────────
    // Called by the blockchain verifier job after on-chain confirmation.
    // Not exposed via HTTP — internal use only.
    async fulfillOrder(orderId, confirmationBlock) {
        const order = await order_repository_1.orderRepository.findById(orderId);
        if (!order)
            throw new errors_1.NotFoundError('Order');
        assertTransition(order.status, 'PAYMENT_CONFIRMED');
        const tx = await order_repository_1.orderRepository.findTransactionByOrder(orderId);
        if (!tx)
            throw new errors_1.AppError('Transaction not found', 500, 'TRANSACTION_NOT_FOUND');
        // Mark transaction confirmed
        await order_repository_1.orderRepository.updateTransaction(tx.id, {
            status: 'CONFIRMED',
            confirmation_block: confirmationBlock,
            confirmed_at: new Date(),
        });
        // Determine fulfillment path
        const hasPhysical = order.items.some(i => i.artwork_format === 'PHYSICAL');
        const hasDigital = order.items.some(i => i.artwork_format === 'DIGITAL');
        let nextStatus;
        if (hasPhysical && !hasDigital) {
            // All physical — moves to PROCESSING, seller handles shipping
            nextStatus = 'PROCESSING';
        }
        else if (!hasPhysical && hasDigital) {
            // All digital — instant fulfillment
            nextStatus = 'FULFILLED';
        }
        else {
            // Mixed — treat as physical flow (seller ships, digital items included)
            nextStatus = 'PROCESSING';
        }
        assertTransition('PAYMENT_CONFIRMED', nextStatus);
        const updated = await order_repository_1.orderRepository.updateStatus(orderId, nextStatus);
        // Generate download tokens for digital items (fire and forget — buyer
        // can retrieve them from GET /api/delivery/my-downloads)
        if (hasDigital) {
            import('../../delivery/services/delivery.service.js').then(({ deliveryService }) => {
                void deliveryService.generateTokensForOrder(orderId, order.buyer_id);
            }).catch(() => { });
        }
        // Credit wallet ledger — one entry PER ORDER ITEM (not aggregated per
        // seller) so each item's proceeds can be independently tracked through
        // its own hold lifecycle:
        //   • DIGITAL items  → AVAILABLE immediately (delivery is instant).
        //   • PHYSICAL items → PENDING_DELIVERY; physicalOrderService moves
        //     these to ON_HOLD (with an available_at N days out) once the item
        //     is actually marked delivered — see adminMarkDelivered().
        // Running balance_after is tracked locally per seller across this loop
        // to avoid re-querying the DB between inserts for the same seller.
        const runningBalance = new Map();
        for (const item of order.items) {
            if (!runningBalance.has(item.seller_id)) {
                runningBalance.set(item.seller_id, await order_repository_1.orderRepository.getSellerBalance(item.seller_id));
            }
            const current = runningBalance.get(item.seller_id);
            const next = current + item.line_total;
            await order_repository_1.orderRepository.appendWalletLedgerEntry({
                user_id: item.seller_id,
                transaction_id: tx.id,
                order_id: orderId,
                order_item_id: item.id,
                type: 'CREDIT',
                category: 'SALE',
                hold_status: item.artwork_format === 'PHYSICAL' ? 'PENDING_DELIVERY' : 'AVAILABLE',
                amount: item.line_total,
                balance_after: next,
                description: `Sale of "${item.artwork_title}" from order #${orderId.slice(0, 8)}`,
            });
            runningBalance.set(item.seller_id, next);
        }
        // Queue buyer confirmation email (fire and forget — never blocks order fulfillment)
        void this.sendOrderConfirmationEmail(order);
        // ── Boot physical pipeline for all PHYSICAL order items ───────────────────
        // Runs after wallet credit and email — entirely fire-and-forget.
        // A failure here must never roll back a confirmed payment.
        if (hasPhysical) {
            const physicalItems = order.items.filter(i => i.artwork_format === 'PHYSICAL');
            // Group items by seller so each artist gets one grouped notification
            const sellerItemMap = new Map();
            for (const item of physicalItems) {
                const list = sellerItemMap.get(item.seller_id) ?? [];
                list.push({ orderItemId: item.id });
                sellerItemMap.set(item.seller_id, list);
            }
            for (const [sellerId, items] of sellerItemMap) {
                import('../services/physical-order.service.js')
                    .then(({ physicalOrderService }) => physicalOrderService.initPhysicalPipeline({
                    orderId,
                    buyerId: order.buyer_id,
                    sellerId,
                    items,
                    generatedBy: order.buyer_id,
                }))
                    .catch(err => console.error('[orderService] physicalOrderService.initPhysicalPipeline failed:', err));
            }
        }
        invalidateOrderCache(orderId);
        return updated;
    },
    // ── cancelOrder ────────────────────────────────────────────────────────────
    async cancelOrder(orderId, requesterId) {
        const order = await order_repository_1.orderRepository.findById(orderId);
        if (!order)
            throw new errors_1.NotFoundError('Order');
        // Only buyer can cancel, and only from cancellable states
        if (order.buyer_id !== requesterId)
            throw new errors_1.ForbiddenError();
        assertTransition(order.status, 'CANCELLED');
        // Release reserved stock for physical items
        for (const item of order.items) {
            if (item.artwork_format === 'PHYSICAL') {
                const optionId = item.variant_snapshot?.option_id;
                await artwork_repository_1.artworkRepository.releaseStock(item.artwork_id, item.quantity, optionId);
            }
        }
        // Expire the transaction if still pending
        const tx = await order_repository_1.orderRepository.findTransactionByOrder(orderId);
        if (tx && (tx.status === 'PENDING' || tx.status === 'CONFIRMING')) {
            await order_repository_1.orderRepository.updateTransaction(tx.id, { status: 'EXPIRED' });
        }
        const updated = await order_repository_1.orderRepository.updateStatus(orderId, 'CANCELLED');
        invalidateOrderCache(orderId);
        return updated;
    },
    // ── updateOrderStatus ──────────────────────────────────────────────────────
    // Used by sellers (PROCESSING → SHIPPED) and admins (any allowed transition).
    async updateOrderStatus(orderId, requesterId, requesterRole, nextStatus) {
        const order = await order_repository_1.orderRepository.findById(orderId);
        if (!order)
            throw new errors_1.NotFoundError('Order');
        const isAdmin = requesterRole === 'ADMIN';
        const isSeller = order.items.some(i => i.seller_id === requesterId);
        if (!isAdmin && !isSeller)
            throw new errors_1.ForbiddenError();
        // Sellers can only move PROCESSING → SHIPPED
        if (!isAdmin && isSeller) {
            if (order.status !== 'PROCESSING' || nextStatus !== 'SHIPPED') {
                throw new errors_1.ForbiddenError('Sellers can only mark processing orders as shipped');
            }
        }
        assertTransition(order.status, nextStatus);
        const updated = await order_repository_1.orderRepository.updateStatus(orderId, nextStatus);
        invalidateOrderCache(orderId);
        return updated;
    },
    // ── getOrder ───────────────────────────────────────────────────────────────
    async getOrder(orderId, requesterId) {
        const cached = await (0, redis_client_1.redisGetJson)(redis_client_1.RedisKeys.orderById(orderId));
        if (cached) {
            assertOrderAccess(cached, requesterId);
            return cached;
        }
        const order = await order_repository_1.orderRepository.findById(orderId);
        if (!order)
            throw new errors_1.NotFoundError('Order');
        assertOrderAccess(order, requesterId);
        void (0, redis_client_1.redisSetJson)(redis_client_1.RedisKeys.orderById(orderId), order, redis_client_1.RedisTTL.orderSingle);
        return order;
    },
    // ── getBuyerOrders ─────────────────────────────────────────────────────────
    async getBuyerOrders(buyerId, filters) {
        return order_repository_1.orderRepository.findByBuyer(buyerId, filters);
    },
    // ── getSellerOrders ────────────────────────────────────────────────────────
    async getSellerOrders(sellerId, filters) {
        return order_repository_1.orderRepository.findBySeller(sellerId, filters);
    },
    // ── expireStaleOrders ──────────────────────────────────────────────────────
    // Called by the background job every 5 minutes. Finds all transactions
    // that have expired and cancels their orders + releases stock.
    async expireStaleOrders() {
        const expired = await order_repository_1.orderRepository.findExpiredPendingTransactions();
        for (const tx of expired) {
            try {
                await order_repository_1.orderRepository.updateTransaction(tx.id, { status: 'EXPIRED' });
                const order = await order_repository_1.orderRepository.findById(tx.order_id);
                if (!order || order.status !== 'PENDING_PAYMENT')
                    continue;
                for (const item of order.items) {
                    if (item.artwork_format === 'PHYSICAL') {
                        await artwork_repository_1.artworkRepository.releaseStock(item.artwork_id, item.quantity, item.variant_snapshot?.option_id);
                    }
                }
                await order_repository_1.orderRepository.updateStatus(tx.order_id, 'CANCELLED');
                invalidateOrderCache(tx.order_id);
            }
            catch {
                // Log and continue — one failure must not block others
                console.error(`[OrderExpiry] Failed to expire order for transaction ${tx.id}`);
            }
        }
    },
    // ── sendOrderConfirmationEmail ─────────────────────────────────────────────
    // Fire-and-forget. Never awaited at the call site.
    async sendOrderConfirmationEmail(order) {
        try {
            const buyer = await user_repository_1.userRepository.findById(order.buyer_id);
            if (!buyer)
                return;
            const itemLines = order.items
                .map(i => `${i.artwork_title} × ${i.quantity} — ${i.currency} ${i.unit_price.toFixed(2)}`)
                .join('\n');
            await email_service_1.emailService.sendOrderConfirmation({
                to: buyer.email,
                orderId: order.id,
                items: order.items,
                total: order.subtotal,
                currency: order.currency,
            });
        }
        catch {
            // Email failure must never propagate — orders continue without it
        }
    },
};
// ── Access guard ──────────────────────────────────────────────────────────────
// An order is readable by its buyer or any seller with an item in it.
function assertOrderAccess(order, requesterId) {
    const isBuyer = order.buyer_id === requesterId;
    const isSeller = order.items.some(i => i.seller_id === requesterId);
    if (!isBuyer && !isSeller)
        throw new errors_1.ForbiddenError();
}
//# sourceMappingURL=order.service.js.map