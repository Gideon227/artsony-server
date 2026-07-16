import { supabase, assertNoError, assertNoErrorMany } from '@/config/database'
import type {
  Order,
  OrderItem,
  OrderSummary,
  OrderStatus,
  OrderVariantSnapshot,
  ShippingAddressSnapshot,
  Transaction,
  TransactionStatus,
  WalletNetwork,
  WalletLedgerEntry,
  WalletLedgerEntryType,
  PaginatedResult,
  OrderFilters,
} from '@/common/types/commerce.types'

// ── Row → Domain mappers ──────────────────────────────────────────────────────

function toOrderItem(row: any): OrderItem {
  return {
    id:                    row['id'],
    order_id:              row['order_id'],
    artwork_id:            row['artwork_id'],
    seller_id:             row['seller_id'],
    artwork_title:         row['artwork_title'],
    artwork_slug:          row['artwork_slug'],
    artwork_thumbnail_url: row['artwork_thumbnail_url'] ?? null,
    artwork_format:        row['artwork_format'],
    unit_price:            Number(row['unit_price']),
    currency:              row['currency'],
    quantity:              row['quantity'],
    line_total:            Number(row['line_total']),
    variant_snapshot:      (row['variant_snapshot'] ?? null) as OrderVariantSnapshot | null,
    created_at:            new Date(row['created_at']),
  }
}

function toOrder(row: any, items: OrderItem[]): Order {
  return {
    id:               row['id'],
    buyer_id:         row['buyer_id'],
    status:           row['status'] as OrderStatus,
    subtotal:         Number(row['subtotal']),
    currency:         row['currency'],
    shipping_address: (row['shipping_address'] ?? null) as ShippingAddressSnapshot | null,
    idempotency_key:  row['idempotency_key'],
    notes:            row['notes'] ?? null,
    items,
    created_at:       new Date(row['created_at']),
    updated_at:       new Date(row['updated_at']),
  }
}

function toOrderSummary(row: any): OrderSummary {
  return {
    id:               row['id'],
    buyer_id:         row['buyer_id'],
    status:           row['status'] as OrderStatus,
    subtotal:         Number(row['subtotal']),
    currency:         row['currency'],
    shipping_address: (row['shipping_address'] ?? null) as ShippingAddressSnapshot | null,
    idempotency_key:  row['idempotency_key'],
    notes:            row['notes'] ?? null,
    item_count:       Number(row['item_count'] ?? 0),
    preview_thumbnail:row['preview_thumbnail'] ?? null,
    created_at:       new Date(row['created_at']),
    updated_at:       new Date(row['updated_at']),
  }
}

function toTransaction(row: any): Transaction {
  return {
    id:                       row['id'],
    order_id:                 row['order_id'],
    status:                   row['status'] as TransactionStatus,
    amount:                   Number(row['amount']),
    currency:                 row['currency'],
    network:                  row['network'] as WalletNetwork,
    recipient_wallet_address: row['recipient_wallet_address'],
    sender_wallet_address:    row['sender_wallet_address'] ?? null,
    tx_hash:                  row['tx_hash'] ?? null,
    confirmation_block:       row['confirmation_block'] ?? null,
    retry_count:              row['retry_count'],
    last_retry_at:            row['last_retry_at'] ? new Date(row['last_retry_at']) : null,
    expires_at:               new Date(row['expires_at']),
    confirmed_at:             row['confirmed_at'] ? new Date(row['confirmed_at']) : null,
    created_at:               new Date(row['created_at']),
    updated_at:               new Date(row['updated_at']),
  }
}

// ── Repository ────────────────────────────────────────────────────────────────

export const orderRepository = {

  // ── CreateOrder ────────────────────────────────────────────────────────────
  // Inserts order + all order_items + transaction in a single Postgres
  // transaction via RPC. This ensures either all three are created or none are.

  async createWithItems(input: {
    buyer_id:         string
    subtotal:         number
    currency:         string
    shipping_address: ShippingAddressSnapshot | null
    idempotency_key:  string
    notes:            string | null
    items: Array<{
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
    }>
    transaction: {
      amount:                   number
      currency:                 string
      network:                  WalletNetwork
      recipient_wallet_address: string
      expires_at:               Date
    }
  }): Promise<{ order: Order; transaction: Transaction }> {
    // Single RPC call — order, order_items, and transaction all insert
    // inside one PL/pgSQL function invocation, so a failure on any of them
    // (including the idempotency_key unique violation) rolls back the
    // whole thing. No orphaned order row, no partial order_items.
    // See 20240801000000_checkout_atomicity.sql for the function body.
    const result = await (supabase() as any).rpc('create_order_with_items', {
      p_buyer_id:         input.buyer_id,
      p_subtotal:         input.subtotal,
      p_currency:         input.currency,
      p_shipping_address: input.shipping_address,
      p_idempotency_key:  input.idempotency_key,
      p_notes:            input.notes,
      p_items:            input.items,
      p_tx_amount:        input.transaction.amount,
      p_tx_currency:      input.transaction.currency,
      p_tx_network:       input.transaction.network,
      p_tx_recipient:     input.transaction.recipient_wallet_address,
      p_tx_expires_at:    input.transaction.expires_at.toISOString(),
    })

    if (result.error) {
      // Preserve the Postgres error code (e.g. 23505 on idempotency_key)
      // so the service layer can distinguish a duplicate-request race
      // from a genuine failure, mirroring seller.repository.submit.
      throw Object.assign(
        new Error(`[Supabase:order.createWithItems] ${result.error.message}`),
        { code: result.error.code as string | undefined },
      )
    }

    const row   = result.data as { order: any; items: any[]; transaction: any }
    const items = (row.items ?? []).map(toOrderItem)

    return {
      order:       toOrder(row.order, items),
      transaction: toTransaction(row.transaction),
    }
  },

  // ── FindById ───────────────────────────────────────────────────────────────

  async findById(orderId: string): Promise<Order | undefined> {
    const orderResult = await (supabase() as any)
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (orderResult.error?.code === 'PGRST116') return undefined
    assertNoError(orderResult, 'order.findById')

    const itemsResult = await (supabase() as any)
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })

    assertNoErrorMany(itemsResult, 'order.findById.items')
    const items = (itemsResult.data ?? []).map(toOrderItem)

    return toOrder(orderResult.data, items)
  },

  // ── UpdateShippingAddress ──────────────────────────────────────────────────
  // Admin-only. Buyers and artists cannot edit order/address details once
  // placed — the shipping_address snapshot is otherwise immutable by design.
  // This is the single sanctioned mutation path for that field.

  async updateShippingAddress(
    orderId: string,
    address: ShippingAddressSnapshot,
  ): Promise<Order | undefined> {
    const result = await (supabase() as any)
      .from('orders')
      .update({
        shipping_address: address,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', orderId)
      .select('*')
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'order.updateShippingAddress')

    const itemsResult = await (supabase() as any)
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })

    assertNoErrorMany(itemsResult, 'order.updateShippingAddress.items')
    const items = (itemsResult.data ?? []).map(toOrderItem)

    return toOrder(result.data, items)
  },

  // ── FindByIdempotencyKey ───────────────────────────────────────────────────
  // Used at checkout initiation to detect duplicate requests.

  async findByIdempotencyKey(key: string, buyerId: string): Promise<Order | undefined> {
    const result = await (supabase() as any)
      .from('orders')
      .select('*')
      .eq('idempotency_key', key)
      .eq('buyer_id', buyerId)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    if (result.error) return undefined

    const itemsResult = await (supabase() as any)
      .from('order_items')
      .select('*')
      .eq('order_id', result.data.id)

    assertNoErrorMany(itemsResult, 'order.findByIdempotencyKey.items')
    return toOrder(result.data, (itemsResult.data ?? []).map(toOrderItem))
  },

  // ── FindByBuyer ────────────────────────────────────────────────────────────

  async findByBuyer(
    buyerId: string,
    filters: OrderFilters,
  ): Promise<PaginatedResult<OrderSummary>> {
    const page  = Math.max(1, filters.page  ?? 1)
    const limit = Math.min(50, Math.max(1, filters.limit ?? 20))
    const from  = (page - 1) * limit
    const to    = from + limit - 1

    let query = (supabase() as any)
      .from('orders')
      .select(`
        *,
        item_count:order_items(count),
        preview_thumbnail:order_items(artwork_thumbnail_url)
      `, { count: 'exact' })
      .eq('buyer_id', buyerId)

    if (filters.status) query = query.eq('status', filters.status)

    query = query
      .order('created_at', { ascending: filters.sort_order === 'asc' })
      .range(from, to)

    const result = await query

    if (result.error) {
      throw new Error(`[Supabase:order.findByBuyer] ${result.error.message}`)
    }

    const total       = result.count ?? 0
    const total_pages = Math.ceil(total / limit)

    return {
      data:        (result.data ?? []).map(toOrderSummary),
      total,
      page,
      limit,
      total_pages,
      has_next:    page < total_pages,
      has_prev:    page > 1,
    }
  },

  // ── FindBySeller ───────────────────────────────────────────────────────────
  // Sellers see individual order_items where seller_id = their ID.
  // They don't see the full order — only their items and the order metadata.

  async findBySeller(
    sellerId: string,
    filters: OrderFilters,
  ): Promise<PaginatedResult<OrderSummary>> {
    const page = Math.max(1, filters.page  ?? 1)
    const limit = Math.min(50, Math.max(1, filters.limit ?? 20))
    const from = (page - 1) * limit
    const to = from + limit - 1

    // Get distinct order IDs that contain this seller's items
    const itemsQuery = await (supabase() as any)
      .from('order_items')
      .select('order_id')
      .eq('seller_id', sellerId)

    if (itemsQuery.error) {
      throw new Error(`[Supabase:order.findBySeller] ${itemsQuery.error.message}`)
    }

    const orderIds: string[] = Array.from(new Set<string>(
      (itemsQuery.data ?? []).map((r: any) => r.order_id as string)
    ))

    if (!orderIds.length) {
      return { data: [], total: 0, page, limit, total_pages: 0, has_next: false, has_prev: false }
    }

    let query = (supabase() as any)
      .from('orders')
      .select('*, item_count:order_items(count), preview_thumbnail:order_items(artwork_thumbnail_url)',
        { count: 'exact' })
      .in('id', orderIds)

    if (filters.status) query = query.eq('status', filters.status)

    query = query
      .order('created_at', { ascending: filters.sort_order === 'asc' })
      .range(from, to)

    const result = await query
    if (result.error) {
      throw new Error(`[Supabase:order.findBySeller] ${result.error.message}`)
    }

    const total = result.count ?? 0
    const total_pages = Math.ceil(total / limit)

    return {
      data: (result.data ?? []).map(toOrderSummary),
      total,
      page,
      limit,
      total_pages,
      has_next: page < total_pages,
      has_prev: page > 1,
    }
  },

  // ── UpdateStatus ───────────────────────────────────────────────────────────

  async updateStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const result = await (supabase() as any)
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select('*')
      .single()

    assertNoError(result, 'order.updateStatus')

    const itemsResult = await (supabase() as any)
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)

    assertNoErrorMany(itemsResult, 'order.updateStatus.items')
    return toOrder(result.data, (itemsResult.data ?? []).map(toOrderItem))
  },

  // ── FindTransactionByOrder ─────────────────────────────────────────────────

  async findTransactionByOrder(orderId: string): Promise<Transaction | undefined> {
    const result = await (supabase() as any)
      .from('transactions')
      .select('*')
      .eq('order_id', orderId)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'order.findTransactionByOrder')
    return toTransaction(result.data)
  },

  // ── UpdateTransaction ──────────────────────────────────────────────────────

  async updateTransaction(
    transactionId: string,
    payload: Partial<{
      status:                TransactionStatus
      sender_wallet_address: string
      tx_hash:               string
      confirmation_block:    number
      retry_count:           number
      last_retry_at:         Date
      confirmed_at:          Date
      expires_at:            Date
    }>,
  ): Promise<Transaction> {
    const update: Record<string, any> = { updated_at: new Date().toISOString() }

    if (payload.status               !== undefined) update['status']                = payload.status
    if (payload.sender_wallet_address !== undefined) update['sender_wallet_address'] = payload.sender_wallet_address
    if (payload.tx_hash              !== undefined) update['tx_hash']               = payload.tx_hash
    if (payload.confirmation_block   !== undefined) update['confirmation_block']    = payload.confirmation_block
    if (payload.retry_count          !== undefined) update['retry_count']           = payload.retry_count
    if (payload.last_retry_at        !== undefined) update['last_retry_at']         = payload.last_retry_at.toISOString()
    if (payload.confirmed_at         !== undefined) update['confirmed_at']          = payload.confirmed_at.toISOString()
    if (payload.expires_at           !== undefined) update['expires_at']            = payload.expires_at.toISOString()

    const result = await (supabase() as any)
      .from('transactions')
      .update(update)
      .eq('id', transactionId)
      .select('*')
      .single()

    assertNoError(result, 'order.updateTransaction')
    return toTransaction(result.data)
  },

  // ── FindTransactionByTxHash ────────────────────────────────────────────────
  // Used for replay attack prevention — tx_hash must be globally unique.

  async findTransactionByTxHash(txHash: string): Promise<Transaction | undefined> {
    const result = await (supabase() as any)
      .from('transactions')
      .select('*')
      .eq('tx_hash', txHash)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    if (result.error) return undefined
    return toTransaction(result.data)
  },

  // ── FindExpiredPendingTransactions ─────────────────────────────────────────
  // Used by the background expiry job. Returns all PENDING/CONFIRMING
  // transactions past their expires_at timestamp.

  async findExpiredPendingTransactions(): Promise<Transaction[]> {
    const result = await (supabase() as any)
      .from('transactions')
      .select('*')
      .in('status', ['PENDING', 'CONFIRMING'])
      .lt('expires_at', new Date().toISOString())

    if (result.error) return []
    return (result.data ?? []).map(toTransaction)
  },

  // ── AppendWalletLedgerEntry ────────────────────────────────────────────────
  // Appends a credit/debit to the seller's wallet ledger after an order
  // is completed. balance_after is computed by the service layer.

  async appendWalletLedgerEntry(input: {
    user_id:        string
    transaction_id: string | null
    order_id:       string | null
    type:           WalletLedgerEntryType
    amount:         number
    balance_after:  number
    description:    string
  }): Promise<WalletLedgerEntry> {
    const result = await (supabase() as any)
      .from('wallet_ledger')
      .insert(input)
      .select('*')
      .single()

    assertNoError(result, 'order.appendWalletLedgerEntry')
    const row = result.data
    return {
      id:             row['id'],
      user_id:        row['user_id'],
      transaction_id: row['transaction_id'] ?? null,
      order_id:       row['order_id'] ?? null,
      type:           row['type'] as WalletLedgerEntryType,
      amount:         Number(row['amount']),
      balance_after:  Number(row['balance_after']),
      description:    row['description'],
      created_at:     new Date(row['created_at']),
    }
  },

  // ── GetWalletBalance ───────────────────────────────────────────────────────
  // Generic — works for any user_id (seller, buyer, etc). The ledger itself
  // is not role-scoped; "seller" balances and "buyer" balances are the same
  // table, same semantics. Use this name for all new call sites.

  async getWalletBalance(userId: string): Promise<number> {
    const result = await (supabase() as any)
      .from('wallet_ledger')
      .select('balance_after')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (result.error || !result.data) return 0
    return Number(result.data.balance_after)
  },

  // ── GetSellerBalance ───────────────────────────────────────────────────────
  // @deprecated Kept for backward compatibility with existing call sites.
  // Use getWalletBalance — this function is not actually seller-specific.

  async getSellerBalance(userId: string): Promise<number> {
    return this.getWalletBalance(userId)
  },
}