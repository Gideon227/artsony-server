import type { Order, OrderSummary, OrderStatus, OrderVariantSnapshot, ShippingAddressSnapshot, Transaction, TransactionStatus, WalletNetwork, WalletLedgerEntry, WalletLedgerEntryType, WalletLedgerCategory, WalletLedgerHoldStatus, PaginatedResult, OrderFilters } from '../../../common/types/commerce.types';
export declare const orderRepository: {
    createWithItems(input: {
        buyer_id: string;
        subtotal: number;
        currency: string;
        shipping_address: ShippingAddressSnapshot | null;
        idempotency_key: string;
        notes: string | null;
        items: Array<{
            artwork_id: string;
            seller_id: string;
            artwork_title: string;
            artwork_slug: string;
            artwork_thumbnail_url: string | null;
            artwork_format: "DIGITAL" | "PHYSICAL";
            unit_price: number;
            currency: string;
            quantity: number;
            variant_snapshot: OrderVariantSnapshot | null;
        }>;
        transaction: {
            amount: number;
            currency: string;
            network: WalletNetwork;
            recipient_wallet_address: string;
            expires_at: Date;
        };
    }): Promise<{
        order: Order;
        transaction: Transaction;
    }>;
    findById(orderId: string): Promise<Order | undefined>;
    updateShippingAddress(orderId: string, address: ShippingAddressSnapshot): Promise<Order | undefined>;
    findByIdempotencyKey(key: string, buyerId: string): Promise<Order | undefined>;
    findByBuyer(buyerId: string, filters: OrderFilters): Promise<PaginatedResult<OrderSummary>>;
    findBySeller(sellerId: string, filters: OrderFilters): Promise<PaginatedResult<OrderSummary>>;
    updateStatus(orderId: string, status: OrderStatus): Promise<Order>;
    findTransactionByOrder(orderId: string): Promise<Transaction | undefined>;
    updateTransaction(transactionId: string, payload: Partial<{
        status: TransactionStatus;
        sender_wallet_address: string;
        tx_hash: string;
        confirmation_block: number;
        retry_count: number;
        last_retry_at: Date;
        confirmed_at: Date;
        expires_at: Date;
    }>): Promise<Transaction>;
    findTransactionByTxHash(txHash: string): Promise<Transaction | undefined>;
    findExpiredPendingTransactions(): Promise<Transaction[]>;
    appendWalletLedgerEntry(input: {
        user_id: string;
        transaction_id: string | null;
        order_id: string | null;
        order_item_id?: string | null;
        type: WalletLedgerEntryType;
        category?: WalletLedgerCategory;
        hold_status?: WalletLedgerHoldStatus;
        available_at?: Date | null;
        amount: number;
        balance_after: number;
        description: string;
    }): Promise<WalletLedgerEntry>;
    transitionDeliveryHold(orderItemId: string, holdDays: number): Promise<WalletLedgerEntry[]>;
    getWalletBalance(userId: string): Promise<number>;
    getSellerBalance(userId: string): Promise<number>;
};
//# sourceMappingURL=order.repository.d.ts.map