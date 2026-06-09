import type { ArtworkFormat } from './artwork.types'

// ── Enums ─────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'FULFILLED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'

export type TransactionStatus =
  | 'PENDING'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'EXPIRED'

export type WalletNetwork = 'TRON' | 'ETHEREUM' | 'BSC'

export type WalletLedgerEntryType = 'CREDIT' | 'DEBIT'

// ── Cart ──────────────────────────────────────────────────────────────────────

/**
 * Snapshot of the variant option selected at add-to-cart time.
 * Stored as JSONB on cart_items so stale-option detection works even
 * after the artist edits or removes a variant option.
 */
export type CartVariantSnapshot = {
  variant_id: string
  variant_type: string
  variant_name: string
  option_id: string
  option_label: string
  price_modifier: number
}

export type CartItem = {
  id: string
  user_id: string
  artwork_id: string
  quantity: number
  price_at_add: number
  currency_at_add: string
  variant_snapshot: CartVariantSnapshot | null
  added_at: Date
}

/**
 * Enriched cart item returned by the cart service — includes live
 * artwork data so the service can flag price changes and stock issues.
 */
export type CartItemWithArtwork = CartItem & {
  artwork: {
    id: string
    title: string
    slug: string
    thumbnail_url: string | null
    artwork_format: ArtworkFormat
    listing_type: 'MARKETPLACE' | 'PORTFOLIO'
    status: string
    moderation_status: string
    price: number | null
    currency: string
    max_purchase_quantity: number | null
    has_variants: boolean
    seller_id: string
    seller_name: string
    seller_avatar_url: string | null
  }
  // Staleness flags — computed by service, not stored
  is_price_changed: boolean
  is_unavailable: boolean
  is_stock_insufficient: boolean
}

export type Cart = {
  items: CartItemWithArtwork[]
  item_count: number
  subtotal: number
  currency: string
  has_stale_items: boolean
}

export type AddToCartInput = {
  artwork_id: string
  quantity: number
  variant_option_id?: string
}

export type UpdateCartItemInput = {
  quantity: number
}

// ── Order ─────────────────────────────────────────────────────────────────────

/**
 * Full snapshot of the variant option as it existed at purchase time.
 * This is written once when the order is created and never mutated.
 */
export type OrderVariantSnapshot = {
  variant_id: string
  variant_type: string
  variant_name: string
  option_id: string
  option_label: string
  price_modifier: number
  sku: string | null
}

/**
 * Snapshot of the shipping address as it existed at checkout time.
 * Not FK'd to shipping_addresses — an address change must never
 * retroactively alter a confirmed order's delivery record.
 */
export type ShippingAddressSnapshot = {
  full_name: string
  phone: string
  address_line_1: string
  address_line_2: string | null
  city: string
  state: string
  postal_code: string
  country_code: string
}

/**
 * A single line item within an order. Snapshots all critical artwork
 * fields so the order receipt is accurate even if the artwork is later
 * edited, archived, or deleted.
 */
export type OrderItem = {
  id: string
  order_id: string
  artwork_id: string
  seller_id: string
  // ── Artwork snapshot ──────────────────────────────────────────────────────
  artwork_title: string
  artwork_slug: string
  artwork_thumbnail_url: string | null
  artwork_format: ArtworkFormat
  // ── Pricing snapshot ──────────────────────────────────────────────────────
  unit_price: number
  currency: string
  quantity: number
  line_total: number
  // ── Variant snapshot (null when artwork has no variants) ──────────────────
  variant_snapshot: OrderVariantSnapshot | null
  created_at: Date
}

export type Order = {
  id: string
  buyer_id: string
  status: OrderStatus
  subtotal: number
  currency: string
  // null for digital-only orders
  shipping_address: ShippingAddressSnapshot | null
  idempotency_key: string
  notes: string | null
  items: OrderItem[]
  created_at: Date
  updated_at: Date
}

export type OrderSummary = Omit<Order, 'items'> & {
  item_count: number
  // First item's thumbnail for list views
  preview_thumbnail: string | null
}

// ── Checkout ──────────────────────────────────────────────────────────────────

export type CheckoutInput = {
  cart_item_ids: string[]
  shipping_address?: ShippingAddressSnapshot
  idempotency_key: string
  notes?: string
}

export type CheckoutResult = {
  order: Order
  payment_instructions: PaymentInstructions
}

// ── Shipping Address (saved) ──────────────────────────────────────────────────

export type ShippingAddress = {
  id: string
  user_id: string
  label: string | null
  full_name: string
  phone: string
  address_line_1: string
  address_line_2: string | null
  city: string
  state: string
  postal_code: string
  country_code: string
  is_default: boolean
  created_at: Date
  updated_at: Date
}

export type CreateShippingAddressInput = Omit<
  ShippingAddress,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>

// ── Digital Delivery ──────────────────────────────────────────────────────────

export type DigitalDeliveryToken = {
  id: string
  order_item_id: string
  artwork_id: string
  buyer_id: string
  token_hash: string
  expires_at: Date
  download_count: number
  max_downloads: number
  last_downloaded_at: Date | null
  created_at: Date
}

// ── Payment / Transaction ─────────────────────────────────────────────────────

export type Transaction = {
  id: string
  order_id: string
  status: TransactionStatus
  amount: number
  currency: string
  network: WalletNetwork
  recipient_wallet_address: string
  sender_wallet_address: string | null
  tx_hash: string | null
  confirmation_block: number | null
  retry_count: number
  last_retry_at: Date | null
  expires_at: Date
  confirmed_at: Date | null
  created_at: Date
  updated_at: Date
}

export type PaymentInstructions = {
  transaction_id: string
  recipient_wallet_address: string
  amount: number
  currency: string
  network: WalletNetwork
  expires_at: Date
}

export type ConfirmPaymentInput = {
  tx_hash: string
  sender_wallet_address: string
  network: WalletNetwork
}

// ── Wallet Ledger ─────────────────────────────────────────────────────────────

export type WalletLedgerEntry = {
  id: string
  user_id: string
  transaction_id: string | null
  order_id: string | null
  type: WalletLedgerEntryType
  amount: number
  balance_after: number
  description: string
  created_at: Date
}

// ── Pagination utility (reusable for order lists) ─────────────────────────────

export type PaginatedResult<T> = {
  data: T[]
  total: number
  page: number
  limit: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
}

export type OrderFilters = {
  status?: OrderStatus
  page?: number
  limit?: number
  sort_order?: 'asc' | 'desc'
}

// ── Order state machine ───────────────────────────────────────────────────────
// Defines which status transitions are legal. Used by the order service
// to validate every status update call before touching the DB.

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PAYMENT_CONFIRMED', 'CANCELLED'],
  PAYMENT_CONFIRMED: ['PROCESSING', 'FULFILLED'],  // FULFILLED = digital fast-path
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['COMPLETED'],
  FULFILLED: ['COMPLETED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
}

export const TRANSACTION_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  PENDING: ['CONFIRMING', 'EXPIRED', 'FAILED'],
  CONFIRMING: ['CONFIRMED', 'FAILED', 'EXPIRED'],
  CONFIRMED: [],
  FAILED: [],
  EXPIRED: [],
}