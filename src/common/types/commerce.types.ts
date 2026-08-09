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
  // Exactly one of these two is used to resolve the order's shipping
  // address snapshot when the order contains a physical item — a saved
  // address by id, or a one-off inline address for this order only.
  shipping_address_id?: string
  shipping_address?: ShippingAddressSnapshot
  // When true and shipping_address (inline) was supplied, it is also saved
  // to the buyer's address book after the order is created. Ignored when
  // shipping_address_id is used, since that address is already saved.
  save_address?: boolean
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

// Buyer-facing "My Downloads" list needs enough to render a usable card —
// a bare token row alone (id/hashes/counters) isn't enough context for a
// buyer to recognize which purchase it belongs to.
export type DigitalDeliveryTokenWithArtwork = DigitalDeliveryToken & {
  artwork_title: string
  artwork_slug: string
  artwork_thumbnail_url: string | null
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

// SALE     — proceeds from a fulfilled order item
// WITHDRAWAL — an artist-requested payout (see modules/wallet)
// REFUND   — money returned to a buyer
// ADJUSTMENT — manual correction, or a reversal of a rejected/failed withdrawal
export type WalletLedgerCategory = 'SALE' | 'WITHDRAWAL' | 'REFUND' | 'ADJUSTMENT'

// PENDING_DELIVERY — sale credit for a physical item not yet delivered; not
//   counted toward available balance.
// ON_HOLD          — item delivered, inside its post-delivery hold window;
//   not counted toward available balance until available_at elapses.
// AVAILABLE        — withdrawable now (digital sales are AVAILABLE
//   immediately; physical sales become AVAILABLE once available_at passes).
export type WalletLedgerHoldStatus = 'PENDING_DELIVERY' | 'ON_HOLD' | 'AVAILABLE'

export type WalletLedgerEntry = {
  id: string
  user_id: string
  transaction_id: string | null
  order_id: string | null
  order_item_id: string | null
  withdrawal_request_id: string | null
  type: WalletLedgerEntryType
  category: WalletLedgerCategory
  hold_status: WalletLedgerHoldStatus
  available_at: Date | null
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
// ── Physical Order Pipeline ───────────────────────────────────────────────────
// Only applies to order items where artwork_format === 'PHYSICAL'.
// Decoupled from OrderStatus (payment state machine) intentionally.

export type TimelineStatus =
  | 'ORDER_RECEIVED'
  | 'ORDER_RECEIVED_ACTIVE'
  | 'AWAITING_CONFIRMATION'
  | 'AWAITING_CONFIRMATION_ACTIVE'
  | 'ORDER_FAILED_TO_CONFIRM'
  | 'AWAITING_PICKUP'
  | 'AWAITING_PICKUP_ACTIVE'
  | 'PICKUP_FAILED'
  | 'COURIER_REJECTED_PICKUP'
  | 'PICKED_UP'
  | 'PICKED_UP_ACTIVE'
  | 'IN_TRANSIT'
  | 'IN_TRANSIT_ACTIVE'
  | 'DELAYED_DELIVERY'
  | 'OUT_FOR_DELIVERY'
  | 'OUT_FOR_DELIVERY_ACTIVE'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'

// Delivery status is the buyer/artist-facing display grouping —
// independent of the granular timeline_status.
export type DeliveryStatus = 'LIVE' | 'DELIVERED' | 'CANCELLED'

export type RefundStatus =
  | 'NONE'
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'PARTIAL'

export type CourierServiceType = 'STANDARD' | 'EXPRESS' | 'OVERNIGHT' | 'ECONOMY'

// ── Order Item Physical State ─────────────────────────────────────────────────
// Per-item physical pipeline state. Each physical item has its own timeline
// since items can be picked up and shipped separately.

export type OrderItemPhysical = {
  id: string
  order_item_id: string
  order_id: string
  timeline_status: TimelineStatus
  delivery_status: DeliveryStatus
  // Shipping
  shipping_cost: number | null
  courier_name: string | null
  courier_service_type: CourierServiceType | null
  tracking_id: string | null
  estimated_delivery_date: Date | null
  pickup_address: string | null
  // Refund
  refund_status: RefundStatus
  refund_amount: number | null
  refund_initiated_at: Date | null
  refund_completed_at: Date | null
  refund_notes: string | null
  // Timestamps
  confirmed_at: Date | null
  picked_up_at: Date | null
  in_transit_at: Date | null
  delivered_at: Date | null
  created_at: Date
  updated_at: Date
}

// ── Order Item Physical: enriched list-view shape ─────────────────────────────
// Bare OrderItemPhysical rows carry no artwork/party info — list endpoints
// (buyer/artist/admin) join in the order_item's product snapshot plus the
// buyer/seller public profile summary so the frontend doesn't have to make
// N follow-up requests per row.

export type OrderPartySummary = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export type OrderItemPhysicalListEntry = OrderItemPhysical & {
  order_number: string | null
  order_item: {
    artwork_id: string
    artwork_title: string
    artwork_slug: string
    artwork_thumbnail_url: string | null
    unit_price: number
    quantity: number
  }
  buyer: OrderPartySummary | null
  seller: OrderPartySummary | null
}

// ── Order Timeline Event ──────────────────────────────────────────────────────
// Append-only. Never updated, never deleted.

export type OrderTimelineEvent = {
  id: string
  order_item_physical_id: string
  order_id: string
  order_item_id: string
  timeline_status: TimelineStatus
  is_pending: boolean              // false = this state is fully active/confirmed
  actor_id: string | null
  actor_role: 'buyer' | 'artist' | 'admin' | 'system' | 'courier'
  notes: string | null
  metadata: Record<string, unknown>
  occurred_at: Date
}

// ── Delivery Proof ────────────────────────────────────────────────────────────

export type DeliveryProof = {
  id: string
  order_item_physical_id: string
  order_id: string
  cloudinary_public_id: string
  secure_url: string
  mime_type: string
  file_size_bytes: number
  uploaded_by: string
  uploader_role: 'admin' | 'courier'
  uploaded_at: Date
}

// ── Invoice ───────────────────────────────────────────────────────────────────

export type OrderInvoice = {
  id: string
  order_id: string
  version: number
  pdf_cloudinary_public_id: string
  pdf_url: string
  generated_at: Date
  generated_by: string           // user id who triggered generation
  trigger: 'order_created' | 'refund_processed' | 'admin_request'
}

// ── Receipt ────────────────────────────────────────────────────────────────────
// Proof of payment — distinct from the invoice. A receipt confirms that
// payment was received (amount, method, transaction reference) and is
// issued exactly once per order at payment confirmation. It is never
// re-versioned. The invoice, by contrast, itemizes goods/services,
// agreed-upon prices, and payment terms, and can be regenerated.

export type OrderReceipt = {
  id: string
  order_id: string
  pdf_cloudinary_public_id: string
  pdf_url: string
  amount_paid: number
  currency: string
  payment_method: string
  transaction_reference: string | null
  generated_at: Date
  generated_by: string
}

// ── Refund Request ────────────────────────────────────────────────────────────
// Artists request; admins approve.

export type RefundRequest = {
  id: string
  order_item_physical_id: string
  order_id: string
  requested_by: string           // user id (always an artist)
  reason: string
  status: 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED'
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: Date | null
  created_at: Date
}

// ── Service fee constant ──────────────────────────────────────────────────────
export const PLATFORM_SERVICE_FEE_RATE = 0.14  // 14% of item cost (not shipping)

// ── Physical pipeline state machine ──────────────────────────────────────────
// Maps each state to the set of states it can transition into.
// Admins only — artists/buyers have narrower permission checks in the service.

export const PHYSICAL_TRANSITIONS: Record<TimelineStatus, TimelineStatus[]> = {
  ORDER_RECEIVED:                    ['ORDER_RECEIVED_ACTIVE'],
  ORDER_RECEIVED_ACTIVE:             ['AWAITING_CONFIRMATION'],
  AWAITING_CONFIRMATION:             ['AWAITING_CONFIRMATION_ACTIVE', 'ORDER_FAILED_TO_CONFIRM'],
  AWAITING_CONFIRMATION_ACTIVE:      ['AWAITING_PICKUP', 'ORDER_FAILED_TO_CONFIRM'],
  ORDER_FAILED_TO_CONFIRM:           [],
  AWAITING_PICKUP:                   ['AWAITING_PICKUP_ACTIVE', 'PICKUP_FAILED', 'COURIER_REJECTED_PICKUP'],
  AWAITING_PICKUP_ACTIVE:            ['PICKED_UP', 'PICKUP_FAILED', 'COURIER_REJECTED_PICKUP'],
  PICKUP_FAILED:                     ['AWAITING_PICKUP'],
  COURIER_REJECTED_PICKUP:           ['AWAITING_PICKUP'],
  PICKED_UP:                         ['PICKED_UP_ACTIVE'],
  PICKED_UP_ACTIVE:                  ['IN_TRANSIT'],
  IN_TRANSIT:                        ['IN_TRANSIT_ACTIVE'],
  IN_TRANSIT_ACTIVE:                 ['OUT_FOR_DELIVERY', 'DELAYED_DELIVERY', 'DELIVERY_FAILED'],
  DELAYED_DELIVERY:                  ['OUT_FOR_DELIVERY', 'DELIVERY_FAILED'],
  OUT_FOR_DELIVERY:                  ['OUT_FOR_DELIVERY_ACTIVE'],
  OUT_FOR_DELIVERY_ACTIVE:           ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERED:                         [],
  DELIVERY_FAILED:                   [],
}

// ── Cancellation boundary ─────────────────────────────────────────────────────
// Buyer or artist can only cancel while the item is within these states.
export const BUYER_ARTIST_CANCELLABLE_STATES = new Set<TimelineStatus>([
  'ORDER_RECEIVED',
  'ORDER_RECEIVED_ACTIVE',
  'AWAITING_CONFIRMATION',
  'AWAITING_CONFIRMATION_ACTIVE',
])

// ── Extended filters ──────────────────────────────────────────────────────────

export type PhysicalOrderFilters = {
  delivery_status?: DeliveryStatus | undefined
  timeline_status?: TimelineStatus | undefined
  timeline_status_in?: TimelineStatus[] | undefined
  refund_status?: RefundStatus | undefined
  courier_name?: string | undefined
  tracking_id?: string | undefined
  page?: number | undefined
  limit?: number | undefined
  sort_order?: 'asc' | 'desc' | undefined
  date_from?: string | undefined
  date_to?: string | undefined
  order_number?: string | undefined
  artist_id?: string | undefined
  buyer_id?: string | undefined
}

// Extended order with physical fields — returned by physical order endpoints
export type PhysicalOrderView = Order & {
  order_number: string
  physical_items: (OrderItem & {
    physical: OrderItemPhysical | null
    timeline: OrderTimelineEvent[]
    delivery_proofs: DeliveryProof[]
  })[]
  invoice: OrderInvoice | null
  receipt: OrderReceipt | null
  refund_requests: RefundRequest[]
  buyer: { id: string; username: string; avatar_url: string | null } | null
  seller: { id: string; username: string; avatar_url: string | null } | null
}

// ── Named list-view presets ───────────────────────────────────────────────────
// The buyer/artist UI tabs ("All", "Live", "Delivered", "Cancelled" for
// buyers; "All", "Live", "Pending", "Completed", "Cancelled" for artists)
// map to combinations of delivery_status/timeline_status that the frontend
// should not have to reconstruct. These presets are resolved server-side
// in the service layer into the underlying PhysicalOrderFilters.

export type BuyerOrderView = 'all' | 'live' | 'delivered' | 'cancelled'

export type ArtistOrderView = 'all' | 'live' | 'pending' | 'completed' | 'cancelled'

// "Pending" for an artist = items not yet confirmed (ORDER_RECEIVED /
// ORDER_RECEIVED_ACTIVE / AWAITING_CONFIRMATION / AWAITING_CONFIRMATION_ACTIVE).
// "Live" = confirmed and in the shipping pipeline, not yet delivered/cancelled.
// "Completed" = DELIVERED. "Cancelled" = delivery_status CANCELLED.
export const ARTIST_PENDING_STATUSES: TimelineStatus[] = [
  'ORDER_RECEIVED',
  'ORDER_RECEIVED_ACTIVE',
  'AWAITING_CONFIRMATION',
  'AWAITING_CONFIRMATION_ACTIVE',
]