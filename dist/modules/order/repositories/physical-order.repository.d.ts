import type { OrderItemPhysical, OrderTimelineEvent, DeliveryProof, OrderInvoice, OrderReceipt, RefundRequest, PhysicalOrderFilters, TimelineStatus, RefundStatus, CourierServiceType } from '../../../common/types/commerce.types';
export declare const physicalOrderRepository: {
    assignOrderNumber(orderId: string): Promise<string>;
    getOrderNumber(orderId: string): Promise<string | null>;
    createPhysicalItems(inputs: Array<{
        order_item_id: string;
        order_id: string;
    }>): Promise<OrderItemPhysical[]>;
    transitionStatus(input: {
        physicalId: string;
        newStatus: TimelineStatus;
        isPending: boolean;
        actorId: string | null;
        actorRole: OrderTimelineEvent["actor_role"];
        notes: string | null;
        metadata: Record<string, unknown>;
    }): Promise<{
        physical: OrderItemPhysical;
        eventId: string;
    }>;
    findByOrderItemId(orderItemId: string): Promise<OrderItemPhysical | undefined>;
    findByOrderId(orderId: string): Promise<OrderItemPhysical[]>;
    updateCourierInfo(physicalId: string, patch: Partial<{
        courier_name: string;
        courier_service_type: CourierServiceType;
        tracking_id: string;
        shipping_cost: number;
        estimated_delivery_date: string;
        pickup_address: string;
    }>): Promise<OrderItemPhysical>;
    updateRefundState(physicalId: string, patch: {
        refund_status: RefundStatus;
        refund_amount?: number;
        refund_initiated_at?: Date;
        refund_completed_at?: Date;
        refund_notes?: string;
    }): Promise<OrderItemPhysical>;
    getTimeline(physicalId: string): Promise<OrderTimelineEvent[]>;
    getTimelineForOrder(orderId: string): Promise<OrderTimelineEvent[]>;
    addDeliveryProof(input: {
        order_item_physical_id: string;
        order_id: string;
        cloudinary_public_id: string;
        secure_url: string;
        mime_type: string;
        file_size_bytes: number;
        uploaded_by: string;
        uploader_role: DeliveryProof["uploader_role"];
    }): Promise<DeliveryProof>;
    getDeliveryProofs(physicalId: string): Promise<DeliveryProof[]>;
    upsertInvoice(input: {
        order_id: string;
        pdf_cloudinary_public_id: string;
        pdf_url: string;
        generated_by: string;
        trigger: OrderInvoice["trigger"];
    }): Promise<OrderInvoice>;
    getLatestInvoice(orderId: string): Promise<OrderInvoice | null>;
    createReceipt(input: {
        order_id: string;
        pdf_cloudinary_public_id: string;
        pdf_url: string;
        amount_paid: number;
        currency: string;
        payment_method: string;
        transaction_reference: string | null;
        generated_by: string;
    }): Promise<OrderReceipt>;
    getReceipt(orderId: string): Promise<OrderReceipt | null>;
    createRefundRequest(input: {
        order_item_physical_id: string;
        order_id: string;
        requested_by: string;
        reason: string;
    }): Promise<RefundRequest>;
    updateRefundRequest(requestId: string, patch: {
        status: RefundRequest["status"];
        admin_notes?: string;
        reviewed_by: string;
    }): Promise<RefundRequest>;
    getRefundRequests(orderId: string): Promise<RefundRequest[]>;
    findPendingRefundRequests(): Promise<RefundRequest[]>;
    findPhysicalItemsAwaitingConfirmation(olderThanDate: Date): Promise<OrderItemPhysical[]>;
    findAllAdminList(filters: PhysicalOrderFilters): Promise<{
        data: OrderItemPhysical[];
        total: number;
        page: number;
        limit: number;
        total_pages: number;
        has_next: boolean;
        has_prev: boolean;
    }>;
    findBySellerWithItems(sellerId: string, filters: PhysicalOrderFilters): Promise<{
        data: OrderItemPhysical[];
        total: number;
        page: number;
        limit: number;
        total_pages: number;
        has_next: boolean;
        has_prev: boolean;
    }>;
    findByBuyerWithItems(buyerId: string, filters: PhysicalOrderFilters): Promise<{
        data: OrderItemPhysical[];
        total: number;
        page: number;
        limit: number;
        total_pages: number;
        has_next: boolean;
        has_prev: boolean;
    }>;
    getUserProfile(userId: string): Promise<{
        id: string;
        username: string;
        avatar_url: string | null;
    } | null>;
    findAllAdminIds(): Promise<string[]>;
    getShippingAddress(orderId: string): Promise<{
        full_name: string;
        phone: string;
        address_line_1: string;
        address_line_2: string | null;
        city: string;
        state: string;
        postal_code: string;
        country_code: string;
    } | null>;
};
//# sourceMappingURL=physical-order.repository.d.ts.map