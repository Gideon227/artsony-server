import type { Order, OrderSummary, OrderStatus, CheckoutInput, CheckoutResult, ConfirmPaymentInput, PaymentInstructions, PaginatedResult, OrderFilters } from '../../../common/types/commerce.types';
export declare const orderService: {
    initiateCheckout(buyerId: string, input: CheckoutInput): Promise<CheckoutResult>;
    confirmPayment(orderId: string, buyerId: string, input: ConfirmPaymentInput): Promise<{
        order: Order;
        payment_instructions: PaymentInstructions;
    }>;
    fulfillOrder(orderId: string, confirmationBlock: number): Promise<Order>;
    cancelOrder(orderId: string, requesterId: string): Promise<Order>;
    updateOrderStatus(orderId: string, requesterId: string, requesterRole: string, nextStatus: OrderStatus): Promise<Order>;
    getOrder(orderId: string, requesterId: string): Promise<Order>;
    getBuyerOrders(buyerId: string, filters: OrderFilters): Promise<PaginatedResult<OrderSummary>>;
    getSellerOrders(sellerId: string, filters: OrderFilters): Promise<PaginatedResult<OrderSummary>>;
    expireStaleOrders(): Promise<void>;
    sendOrderConfirmationEmail(order: Order): Promise<void>;
};
//# sourceMappingURL=order.service.d.ts.map