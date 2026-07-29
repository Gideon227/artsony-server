"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderRepository = void 0;
const database_1 = require("../../../config/database");
// ── Row → Domain mappers ──────────────────────────────────────────────────────
function toOrderItem(row) {
    return {
        id: row['id'],
        order_id: row['order_id'],
        artwork_id: row['artwork_id'],
        seller_id: row['seller_id'],
        artwork_title: row['artwork_title'],
        artwork_slug: row['artwork_slug'],
        artwork_thumbnail_url: row['artwork_thumbnail_url'] ?? null,
        artwork_format: row['artwork_format'],
        unit_price: Number(row['unit_price']),
        currency: row['currency'],
        quantity: row['quantity'],
        line_total: Number(row['line_total']),
        variant_snapshot: (row['variant_snapshot'] ?? null),
        created_at: new Date(row['created_at']),
    };
}
function toWalletLedgerEntry(row) {
    return {
        id: row['id'],
        user_id: row['user_id'],
        transaction_id: row['transaction_id'] ?? null,
        order_id: row['order_id'] ?? null,
        order_item_id: row['order_item_id'] ?? null,
        withdrawal_request_id: row['withdrawal_request_id'] ?? null,
        type: row['type'],
        category: row['category'],
        hold_status: row['hold_status'],
        available_at: row['available_at'] ? new Date(row['available_at']) : null,
        amount: Number(row['amount']),
        balance_after: Number(row['balance_after']),
        description: row['description'],
        created_at: new Date(row['created_at']),
    };
}
function toOrder(row, items) {
    return {
        id: row['id'],
        buyer_id: row['buyer_id'],
        status: row['status'],
        subtotal: Number(row['subtotal']),
        currency: row['currency'],
        shipping_address: (row['shipping_address'] ?? null),
        idempotency_key: row['idempotency_key'],
        notes: row['notes'] ?? null,
        items,
        created_at: new Date(row['created_at']),
        updated_at: new Date(row['updated_at']),
    };
}
function toOrderSummary(row) {
    return {
        id: row['id'],
        buyer_id: row['buyer_id'],
        status: row['status'],
        subtotal: Number(row['subtotal']),
        currency: row['currency'],
        shipping_address: (row['shipping_address'] ?? null),
        idempotency_key: row['idempotency_key'],
        notes: row['notes'] ?? null,
        item_count: Number(row['item_count'] ?? 0),
        preview_thumbnail: row['preview_thumbnail'] ?? null,
        created_at: new Date(row['created_at']),
        updated_at: new Date(row['updated_at']),
    };
}
function toTransaction(row) {
    return {
        id: row['id'],
        order_id: row['order_id'],
        status: row['status'],
        amount: Number(row['amount']),
        currency: row['currency'],
        network: row['network'],
        recipient_wallet_address: row['recipient_wallet_address'],
        sender_wallet_address: row['sender_wallet_address'] ?? null,
        tx_hash: row['tx_hash'] ?? null,
        confirmation_block: row['confirmation_block'] ?? null,
        retry_count: row['retry_count'],
        last_retry_at: row['last_retry_at'] ? new Date(row['last_retry_at']) : null,
        expires_at: new Date(row['expires_at']),
        confirmed_at: row['confirmed_at'] ? new Date(row['confirmed_at']) : null,
        created_at: new Date(row['created_at']),
        updated_at: new Date(row['updated_at']),
    };
}
// ── Repository ────────────────────────────────────────────────────────────────
exports.orderRepository = {
    // ── CreateOrder ────────────────────────────────────────────────────────────
    // Inserts order + all order_items + transaction in a single Postgres
    // transaction via RPC. This ensures either all three are created or none are.
    async createWithItems(input) {
        // Single RPC call — order, order_items, and transaction all insert
        // inside one PL/pgSQL function invocation, so a failure on any of them
        // (including the idempotency_key unique violation) rolls back the
        // whole thing. No orphaned order row, no partial order_items.
        // See 20240801000000_checkout_atomicity.sql for the function body.
        const result = await (0, database_1.supabase)().rpc('create_order_with_items', {
            p_buyer_id: input.buyer_id,
            p_subtotal: input.subtotal,
            p_currency: input.currency,
            p_shipping_address: input.shipping_address,
            p_idempotency_key: input.idempotency_key,
            p_notes: input.notes,
            p_items: input.items,
            p_tx_amount: input.transaction.amount,
            p_tx_currency: input.transaction.currency,
            p_tx_network: input.transaction.network,
            p_tx_recipient: input.transaction.recipient_wallet_address,
            p_tx_expires_at: input.transaction.expires_at.toISOString(),
        });
        if (result.error) {
            // Preserve the Postgres error code (e.g. 23505 on idempotency_key)
            // so the service layer can distinguish a duplicate-request race
            // from a genuine failure, mirroring seller.repository.submit.
            throw Object.assign(new Error(`[Supabase:order.createWithItems] ${result.error.message}`), { code: result.error.code });
        }
        const row = result.data;
        const items = (row.items ?? []).map(toOrderItem);
        return {
            order: toOrder(row.order, items),
            transaction: toTransaction(row.transaction),
        };
    },
    // ── FindById ───────────────────────────────────────────────────────────────
    async findById(orderId) {
        const orderResult = await (0, database_1.supabase)()
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();
        if (orderResult.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(orderResult, 'order.findById');
        const itemsResult = await (0, database_1.supabase)()
            .from('order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true });
        (0, database_1.assertNoErrorMany)(itemsResult, 'order.findById.items');
        const items = (itemsResult.data ?? []).map(toOrderItem);
        return toOrder(orderResult.data, items);
    },
    // ── UpdateShippingAddress ──────────────────────────────────────────────────
    // Admin-only. Buyers and artists cannot edit order/address details once
    // placed — the shipping_address snapshot is otherwise immutable by design.
    // This is the single sanctioned mutation path for that field.
    async updateShippingAddress(orderId, address) {
        const result = await (0, database_1.supabase)()
            .from('orders')
            .update({
            shipping_address: address,
            updated_at: new Date().toISOString(),
        })
            .eq('id', orderId)
            .select('*')
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'order.updateShippingAddress');
        const itemsResult = await (0, database_1.supabase)()
            .from('order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true });
        (0, database_1.assertNoErrorMany)(itemsResult, 'order.updateShippingAddress.items');
        const items = (itemsResult.data ?? []).map(toOrderItem);
        return toOrder(result.data, items);
    },
    // ── FindByIdempotencyKey ───────────────────────────────────────────────────
    // Used at checkout initiation to detect duplicate requests.
    async findByIdempotencyKey(key, buyerId) {
        const result = await (0, database_1.supabase)()
            .from('orders')
            .select('*')
            .eq('idempotency_key', key)
            .eq('buyer_id', buyerId)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        if (result.error)
            return undefined;
        const itemsResult = await (0, database_1.supabase)()
            .from('order_items')
            .select('*')
            .eq('order_id', result.data.id);
        (0, database_1.assertNoErrorMany)(itemsResult, 'order.findByIdempotencyKey.items');
        return toOrder(result.data, (itemsResult.data ?? []).map(toOrderItem));
    },
    // ── FindByBuyer ────────────────────────────────────────────────────────────
    async findByBuyer(buyerId, filters) {
        const page = Math.max(1, filters.page ?? 1);
        const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        let query = (0, database_1.supabase)()
            .from('orders')
            .select(`
        *,
        item_count:order_items(count),
        preview_thumbnail:order_items(artwork_thumbnail_url)
      `, { count: 'exact' })
            .eq('buyer_id', buyerId);
        if (filters.status)
            query = query.eq('status', filters.status);
        query = query
            .order('created_at', { ascending: filters.sort_order === 'asc' })
            .range(from, to);
        const result = await query;
        if (result.error) {
            throw new Error(`[Supabase:order.findByBuyer] ${result.error.message}`);
        }
        const total = result.count ?? 0;
        const total_pages = Math.ceil(total / limit);
        return {
            data: (result.data ?? []).map(toOrderSummary),
            total,
            page,
            limit,
            total_pages,
            has_next: page < total_pages,
            has_prev: page > 1,
        };
    },
    // ── FindBySeller ───────────────────────────────────────────────────────────
    // Sellers see individual order_items where seller_id = their ID.
    // They don't see the full order — only their items and the order metadata.
    async findBySeller(sellerId, filters) {
        const page = Math.max(1, filters.page ?? 1);
        const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        // Get distinct order IDs that contain this seller's items
        const itemsQuery = await (0, database_1.supabase)()
            .from('order_items')
            .select('order_id')
            .eq('seller_id', sellerId);
        if (itemsQuery.error) {
            throw new Error(`[Supabase:order.findBySeller] ${itemsQuery.error.message}`);
        }
        const orderIds = Array.from(new Set((itemsQuery.data ?? []).map((r) => r.order_id)));
        if (!orderIds.length) {
            return { data: [], total: 0, page, limit, total_pages: 0, has_next: false, has_prev: false };
        }
        let query = (0, database_1.supabase)()
            .from('orders')
            .select('*, item_count:order_items(count), preview_thumbnail:order_items(artwork_thumbnail_url)', { count: 'exact' })
            .in('id', orderIds);
        if (filters.status)
            query = query.eq('status', filters.status);
        query = query
            .order('created_at', { ascending: filters.sort_order === 'asc' })
            .range(from, to);
        const result = await query;
        if (result.error) {
            throw new Error(`[Supabase:order.findBySeller] ${result.error.message}`);
        }
        const total = result.count ?? 0;
        const total_pages = Math.ceil(total / limit);
        return {
            data: (result.data ?? []).map(toOrderSummary),
            total,
            page,
            limit,
            total_pages,
            has_next: page < total_pages,
            has_prev: page > 1,
        };
    },
    // ── UpdateStatus ───────────────────────────────────────────────────────────
    async updateStatus(orderId, status) {
        const result = await (0, database_1.supabase)()
            .from('orders')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', orderId)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'order.updateStatus');
        const itemsResult = await (0, database_1.supabase)()
            .from('order_items')
            .select('*')
            .eq('order_id', orderId);
        (0, database_1.assertNoErrorMany)(itemsResult, 'order.updateStatus.items');
        return toOrder(result.data, (itemsResult.data ?? []).map(toOrderItem));
    },
    // ── FindTransactionByOrder ─────────────────────────────────────────────────
    async findTransactionByOrder(orderId) {
        const result = await (0, database_1.supabase)()
            .from('transactions')
            .select('*')
            .eq('order_id', orderId)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'order.findTransactionByOrder');
        return toTransaction(result.data);
    },
    // ── UpdateTransaction ──────────────────────────────────────────────────────
    async updateTransaction(transactionId, payload) {
        const update = { updated_at: new Date().toISOString() };
        if (payload.status !== undefined)
            update['status'] = payload.status;
        if (payload.sender_wallet_address !== undefined)
            update['sender_wallet_address'] = payload.sender_wallet_address;
        if (payload.tx_hash !== undefined)
            update['tx_hash'] = payload.tx_hash;
        if (payload.confirmation_block !== undefined)
            update['confirmation_block'] = payload.confirmation_block;
        if (payload.retry_count !== undefined)
            update['retry_count'] = payload.retry_count;
        if (payload.last_retry_at !== undefined)
            update['last_retry_at'] = payload.last_retry_at.toISOString();
        if (payload.confirmed_at !== undefined)
            update['confirmed_at'] = payload.confirmed_at.toISOString();
        if (payload.expires_at !== undefined)
            update['expires_at'] = payload.expires_at.toISOString();
        const result = await (0, database_1.supabase)()
            .from('transactions')
            .update(update)
            .eq('id', transactionId)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'order.updateTransaction');
        return toTransaction(result.data);
    },
    // ── FindTransactionByTxHash ────────────────────────────────────────────────
    // Used for replay attack prevention — tx_hash must be globally unique.
    async findTransactionByTxHash(txHash) {
        const result = await (0, database_1.supabase)()
            .from('transactions')
            .select('*')
            .eq('tx_hash', txHash)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        if (result.error)
            return undefined;
        return toTransaction(result.data);
    },
    // ── FindExpiredPendingTransactions ─────────────────────────────────────────
    // Used by the background expiry job. Returns all PENDING/CONFIRMING
    // transactions past their expires_at timestamp.
    async findExpiredPendingTransactions() {
        const result = await (0, database_1.supabase)()
            .from('transactions')
            .select('*')
            .in('status', ['PENDING', 'CONFIRMING'])
            .lt('expires_at', new Date().toISOString());
        if (result.error)
            return [];
        return (result.data ?? []).map(toTransaction);
    },
    // ── AppendWalletLedgerEntry ────────────────────────────────────────────────
    // Appends a credit/debit to the seller's wallet ledger after an order
    // is completed. balance_after is computed by the service layer.
    async appendWalletLedgerEntry(input) {
        const payload = {
            user_id: input.user_id,
            transaction_id: input.transaction_id,
            order_id: input.order_id,
            order_item_id: input.order_item_id ?? null,
            type: input.type,
            category: input.category ?? 'SALE',
            hold_status: input.hold_status ?? 'AVAILABLE',
            available_at: (input.hold_status ?? 'AVAILABLE') === 'AVAILABLE'
                ? (input.available_at ?? new Date()).toISOString()
                : (input.available_at?.toISOString() ?? null),
            amount: input.amount,
            balance_after: input.balance_after,
            description: input.description,
        };
        const result = await (0, database_1.supabase)()
            .from('wallet_ledger')
            .insert(payload)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'order.appendWalletLedgerEntry');
        return toWalletLedgerEntry(result.data);
    },
    // ── TransitionDeliveryHold ──────────────────────────────────────────────────
    // Moves the PENDING_DELIVERY sale credit(s) for an order item into ON_HOLD
    // once it's been marked delivered, starting the hold-period clock. No-op
    // (returns []) for digital items, which never had a PENDING_DELIVERY row.
    async transitionDeliveryHold(orderItemId, holdDays) {
        const result = await (0, database_1.supabase)().rpc('transition_delivery_hold', {
            p_order_item_id: orderItemId,
            p_hold_days: holdDays,
        });
        if (result.error) {
            throw new Error(`[Supabase:order.transitionDeliveryHold] ${result.error.message}`);
        }
        return (result.data ?? []).map(toWalletLedgerEntry);
    },
    // ── GetWalletBalance ───────────────────────────────────────────────────────
    // Generic — works for any user_id (seller, buyer, etc). The ledger itself
    // is not role-scoped; "seller" balances and "buyer" balances are the same
    // table, same semantics. Use this name for all new call sites.
    async getWalletBalance(userId) {
        const result = await (0, database_1.supabase)()
            .from('wallet_ledger')
            .select('balance_after')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (result.error || !result.data)
            return 0;
        return Number(result.data.balance_after);
    },
    // ── GetSellerBalance ───────────────────────────────────────────────────────
    // @deprecated Kept for backward compatibility with existing call sites.
    // Use getWalletBalance — this function is not actually seller-specific.
    async getSellerBalance(userId) {
        return this.getWalletBalance(userId);
    },
};
//# sourceMappingURL=order.repository.js.map