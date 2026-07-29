import type { ArtworkFormat } from './artwork.types';
export type OrderStatus = 'PENDING_PAYMENT' | 'PAYMENT_CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'FULFILLED' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
export type TransactionStatus = 'PENDING' | 'CONFIRMING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';
export type WalletNetwork = 'TRON' | 'ETHEREUM' | 'BSC';
export type WalletLedgerEntryType = 'CREDIT' | 'DEBIT';
/**
 * Snapshot of the variant option selected at add-to-cart time.
 * Stored as JSONB on cart_items so stale-option detection works even
 * after the artist edits or removes a variant option.
 */
export type CartVariantSnapshot = {
    variant_id: string;
    variant_type: string;
    variant_name: string;
    option_id: string;
    option_label: string;
    price_modifier: number;
};
export type CartItem = {
    id: string;
    user_id: string;
    artwork_id: string;
    quantity: number;
    price_at_add: number;
    currency_at_add: string;
    variant_snapshot: CartVariantSnapshot | null;
    added_at: Date;
};
/**
 * Enriched cart item returned by the cart service — includes live
 * artwork data so the service can flag price changes and stock issues.
 */
export type CartItemWithArtwork = CartItem & {
    artwork: {
        id: string;
        title: string;
        slug: string;
        thumbnail_url: string | null;
        artwork_format: ArtworkFormat;
        listing_type: 'MARKETPLACE' | 'PORTFOLIO';
        status: string;
        moderation_status: string;
        price: number | null;
        currency: string;
        max_purchase_quantity: number | null;
        has_variants: boolean;
        seller_id: string;
        seller_name: string;
        seller_avatar_url: string | null;
    };
    is_price_changed: boolean;
    is_unavailable: boolean;
    is_stock_insufficient: boolean;
};
export type Cart = {
    items: CartItemWithArtwork[];
    item_count: number;
    subtotal: number;
    currency: string;
    has_stale_items: boolean;
};
export type AddToCartInput = {
    artwork_id: string;
    quantity: number;
    variant_option_id?: string;
};
export type UpdateCartItemInput = {
    quantity: number;
};
/**
 * Full snapshot of the variant option as it existed at purchase time.
 * This is written once when the order is created and never mutated.
 */
export type OrderVariantSnapshot = {
    variant_id: string;
    variant_type: string;
    variant_name: string;
    option_id: string;
    option_label: string;
    price_modifier: number;
    sku: string | null;
};
/**
 * Snapshot of the shipping address as it existed at checkout time.
 * Not FK'd to shipping_addresses — an address change must never
 * retroactively alter a confirmed order's delivery record.
 */
export type ShippingAddressSnapshot = {
    full_name: string;
    phone: string;
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    state: string;
    postal_code: string;
    country_code: string;
};
/**
 * A single line item within an order. Snapshots all critical artwork
 * fields so the order receipt is accurate even if the artwork is later
 * edited, archived, or deleted.
 */
export type OrderItem = {
    id: string;
    order_id: string;
    artwork_id: string;
    seller_id: string;
    artwork_title: string;
    artwork_slug: string;
    artwork_thumbnail_url: string | null;
    artwork_format: ArtworkFormat;
    unit_price: number;
    currency: string;
    quantity: number;
    line_total: number;
    variant_snapshot: OrderVariantSnapshot | null;
    created_at: Date;
};
export type Order = {
    id: string;
    buyer_id: string;
    status: OrderStatus;
    subtotal: number;
    currency: string;
    shipping_address: ShippingAddressSnapshot | null;
    idempotency_key: string;
    notes: string | null;
    items: OrderItem[];
    created_at: Date;
    updated_at: Date;
};
export type OrderSummary = Omit<Order, 'items'> & {
    item_count: number;
    preview_thumbnail: string | null;
};
export type CheckoutInput = {
    cart_item_ids: string[];
    shipping_address_id?: string;
    shipping_address?: ShippingAddressSnapshot;
    save_address?: boolean;
    idempotency_key: string;
    notes?: string;
};
export type CheckoutResult = {
    order: Order;
    payment_instructions: PaymentInstructions;
};
export type ShippingAddress = {
    id: string;
    user_id: string;
    label: string | null;
    full_name: string;
    phone: string;
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    state: string;
    postal_code: string;
    country_code: string;
    is_default: boolean;
    created_at: Date;
    updated_at: Date;
};
export type CreateShippingAddressInput = Omit<ShippingAddress, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type DigitalDeliveryToken = {
    id: string;
    order_item_id: string;
    artwork_id: string;
    buyer_id: string;
    token_hash: string;
    expires_at: Date;
    download_count: number;
    max_downloads: number;
    last_downloaded_at: Date | null;
    created_at: Date;
};
export type Transaction = {
    id: string;
    order_id: string;
    status: TransactionStatus;
    amount: number;
    currency: string;
    network: WalletNetwork;
    recipient_wallet_address: string;
    sender_wallet_address: string | null;
    tx_hash: string | null;
    confirmation_block: number | null;
    retry_count: number;
    last_retry_at: Date | null;
    expires_at: Date;
    confirmed_at: Date | null;
    created_at: Date;
    updated_at: Date;
};
export type PaymentInstructions = {
    transaction_id: string;
    recipient_wallet_address: string;
    amount: number;
    currency: string;
    network: WalletNetwork;
    expires_at: Date;
};
export type ConfirmPaymentInput = {
    tx_hash: string;
    sender_wallet_address: string;
    network: WalletNetwork;
};
export type WalletLedgerCategory = 'SALE' | 'WITHDRAWAL' | 'REFUND' | 'ADJUSTMENT';
export type WalletLedgerHoldStatus = 'PENDING_DELIVERY' | 'ON_HOLD' | 'AVAILABLE';
export type WalletLedgerEntry = {
    id: string;
    user_id: string;
    transaction_id: string | null;
    order_id: string | null;
    order_item_id: string | null;
    withdrawal_request_id: string | null;
    type: WalletLedgerEntryType;
    category: WalletLedgerCategory;
    hold_status: WalletLedgerHoldStatus;
    available_at: Date | null;
    amount: number;
    balance_after: number;
    description: string;
    created_at: Date;
};
export type PaginatedResult<T> = {
    data: T[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
};
export type OrderFilters = {
    status?: OrderStatus;
    page?: number;
    limit?: number;
    sort_order?: 'asc' | 'desc';
};
export declare const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]>;
export declare const TRANSACTION_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]>;
export type TimelineStatus = 'ORDER_RECEIVED' | 'ORDER_RECEIVED_ACTIVE' | 'AWAITING_CONFIRMATION' | 'AWAITING_CONFIRMATION_ACTIVE' | 'ORDER_FAILED_TO_CONFIRM' | 'AWAITING_PICKUP' | 'AWAITING_PICKUP_ACTIVE' | 'PICKUP_FAILED' | 'COURIER_REJECTED_PICKUP' | 'PICKED_UP' | 'PICKED_UP_ACTIVE' | 'IN_TRANSIT' | 'IN_TRANSIT_ACTIVE' | 'DELAYED_DELIVERY' | 'OUT_FOR_DELIVERY' | 'OUT_FOR_DELIVERY_ACTIVE' | 'DELIVERED' | 'DELIVERY_FAILED';
export type DeliveryStatus = 'LIVE' | 'DELIVERED' | 'CANCELLED';
export type RefundStatus = 'NONE' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PARTIAL';
export type CourierServiceType = 'STANDARD' | 'EXPRESS' | 'OVERNIGHT' | 'ECONOMY';
export type OrderItemPhysical = {
    id: string;
    order_item_id: string;
    order_id: string;
    timeline_status: TimelineStatus;
    delivery_status: DeliveryStatus;
    shipping_cost: number | null;
    courier_name: string | null;
    courier_service_type: CourierServiceType | null;
    tracking_id: string | null;
    estimated_delivery_date: Date | null;
    pickup_address: string | null;
    refund_status: RefundStatus;
    refund_amount: number | null;
    refund_initiated_at: Date | null;
    refund_completed_at: Date | null;
    refund_notes: string | null;
    confirmed_at: Date | null;
    picked_up_at: Date | null;
    in_transit_at: Date | null;
    delivered_at: Date | null;
    created_at: Date;
    updated_at: Date;
};
export type OrderTimelineEvent = {
    id: string;
    order_item_physical_id: string;
    order_id: string;
    order_item_id: string;
    timeline_status: TimelineStatus;
    is_pending: boolean;
    actor_id: string | null;
    actor_role: 'buyer' | 'artist' | 'admin' | 'system' | 'courier';
    notes: string | null;
    metadata: Record<string, unknown>;
    occurred_at: Date;
};
export type DeliveryProof = {
    id: string;
    order_item_physical_id: string;
    order_id: string;
    cloudinary_public_id: string;
    secure_url: string;
    mime_type: string;
    file_size_bytes: number;
    uploaded_by: string;
    uploader_role: 'admin' | 'courier';
    uploaded_at: Date;
};
export type OrderInvoice = {
    id: string;
    order_id: string;
    version: number;
    pdf_cloudinary_public_id: string;
    pdf_url: string;
    generated_at: Date;
    generated_by: string;
    trigger: 'order_created' | 'refund_processed' | 'admin_request';
};
export type OrderReceipt = {
    id: string;
    order_id: string;
    pdf_cloudinary_public_id: string;
    pdf_url: string;
    amount_paid: number;
    currency: string;
    payment_method: string;
    transaction_reference: string | null;
    generated_at: Date;
    generated_by: string;
};
export type RefundRequest = {
    id: string;
    order_item_physical_id: string;
    order_id: string;
    requested_by: string;
    reason: string;
    status: 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED';
    admin_notes: string | null;
    reviewed_by: string | null;
    reviewed_at: Date | null;
    created_at: Date;
};
export declare const PLATFORM_SERVICE_FEE_RATE = 0.14;
export declare const PHYSICAL_TRANSITIONS: Record<TimelineStatus, TimelineStatus[]>;
export declare const BUYER_ARTIST_CANCELLABLE_STATES: Set<TimelineStatus>;
export type PhysicalOrderFilters = {
    delivery_status?: DeliveryStatus | undefined;
    timeline_status?: TimelineStatus | undefined;
    timeline_status_in?: TimelineStatus[] | undefined;
    refund_status?: RefundStatus | undefined;
    courier_name?: string | undefined;
    tracking_id?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    sort_order?: 'asc' | 'desc' | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
    order_number?: string | undefined;
    artist_id?: string | undefined;
    buyer_id?: string | undefined;
};
export type PhysicalOrderView = Order & {
    order_number: string;
    physical_items: (OrderItem & {
        physical: OrderItemPhysical | null;
        timeline: OrderTimelineEvent[];
        delivery_proofs: DeliveryProof[];
    })[];
    invoice: OrderInvoice | null;
    receipt: OrderReceipt | null;
    refund_requests: RefundRequest[];
    buyer: {
        id: string;
        username: string;
        avatar_url: string | null;
    } | null;
    seller: {
        id: string;
        username: string;
        avatar_url: string | null;
    } | null;
};
export type BuyerOrderView = 'all' | 'live' | 'delivered' | 'cancelled';
export type ArtistOrderView = 'all' | 'live' | 'pending' | 'completed' | 'cancelled';
export declare const ARTIST_PENDING_STATUSES: TimelineStatus[];
//# sourceMappingURL=commerce.types.d.ts.map