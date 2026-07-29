import type { TimelineStatus, CourierServiceType, OrderItemPhysical, OrderTimelineEvent, DeliveryProof, RefundRequest, OrderInvoice, OrderReceipt, PhysicalOrderFilters, BuyerOrderView, ArtistOrderView } from '../../../common/types/commerce.types';
export declare const physicalOrderService: {
    initPhysicalPipeline(input: {
        orderId: string;
        buyerId: string;
        sellerId: string;
        items: Array<{
            orderItemId: string;
        }>;
        generatedBy: string;
    }): Promise<void>;
    artistConfirm(input: {
        physicalId: string;
        actorId: string;
        actorRole: string;
    }): Promise<OrderItemPhysical>;
    adminActivatePickup(input: {
        physicalId: string;
        actorId: string;
        actorRole: string;
        courier_name: string;
        courier_service_type: CourierServiceType;
        shipping_cost: number;
        pickup_address: string;
        estimated_delivery_date?: string;
    }): Promise<OrderItemPhysical>;
    adminMarkPickedUp(input: {
        physicalId: string;
        actorId: string;
        actorRole: string;
        notes?: string;
    }): Promise<OrderItemPhysical>;
    adminMarkInTransit(input: {
        physicalId: string;
        actorId: string;
        actorRole: string;
        tracking_id?: string;
        notes?: string;
    }): Promise<OrderItemPhysical>;
    adminMarkOutForDelivery(input: {
        physicalId: string;
        actorId: string;
        actorRole: string;
        notes?: string;
    }): Promise<OrderItemPhysical>;
    adminMarkDelivered(input: {
        physicalId: string;
        actorId: string;
        actorRole: string;
        notes?: string;
    }): Promise<OrderItemPhysical>;
    adminMarkDeliveryFailed(input: {
        physicalId: string;
        actorId: string;
        actorRole: string;
        notes: string;
    }): Promise<OrderItemPhysical>;
    adminMarkDelayed(input: {
        physicalId: string;
        actorId: string;
        actorRole: string;
        notes: string;
    }): Promise<OrderItemPhysical>;
    adminHandlePickupFailure(input: {
        physicalId: string;
        actorId: string;
        actorRole: string;
        reason: "PICKUP_FAILED" | "COURIER_REJECTED_PICKUP";
        notes: string;
    }): Promise<OrderItemPhysical>;
    updateCourierInfo(input: {
        physicalId: string;
        actorId: string;
        actorRole: string;
        courier_name?: string;
        courier_service_type?: CourierServiceType;
        tracking_id?: string;
        shipping_cost?: number;
        estimated_delivery_date?: string;
        pickup_address?: string;
    }): Promise<OrderItemPhysical>;
    cancelItem(input: {
        physicalId: string;
        actorId: string;
        actorRole: string;
        reason: string;
    }): Promise<OrderItemPhysical>;
    artistRequestRefund(input: {
        physicalId: string;
        actorId: string;
        actorRole: string;
        reason: string;
    }): Promise<RefundRequest>;
    adminProcessRefund(input: {
        requestId: string;
        actorId: string;
        actorRole: string;
        decision: "APPROVED" | "REJECTED";
        admin_notes?: string;
        item_cost?: number;
        order_number?: string;
    }): Promise<{
        request: RefundRequest;
        physical: OrderItemPhysical;
    }>;
    addDeliveryProof(input: {
        physicalId: string;
        actorId: string;
        actorRole: string;
        cloudinary_public_id: string;
        secure_url: string;
        mime_type: string;
        file_size_bytes: number;
    }): Promise<DeliveryProof>;
    getOrderView(physicalId: string, requesterId: string, requesterRole: string): Promise<{
        physical: OrderItemPhysical;
        timeline: OrderTimelineEvent[];
        delivery_proofs: DeliveryProof[];
        invoice: OrderInvoice | null;
        receipt: OrderReceipt | null;
        refund_requests: RefundRequest[];
        delivery_address: {
            full_name: string;
            phone: string;
            address_line_1: string;
            address_line_2: string | null;
            city: string;
            state: string;
            postal_code: string;
            country_code: string;
        } | null;
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
    }>;
    listForBuyer(buyerId: string, view: BuyerOrderView, filters: PhysicalOrderFilters): Promise<{
        data: OrderItemPhysical[];
        total: number;
        page: number;
        limit: number;
        total_pages: number;
        has_next: boolean;
        has_prev: boolean;
    }>;
    listForArtist(sellerId: string, view: ArtistOrderView, filters: PhysicalOrderFilters): Promise<{
        data: OrderItemPhysical[];
        total: number;
        page: number;
        limit: number;
        total_pages: number;
        has_next: boolean;
        has_prev: boolean;
    }>;
    adminList(filters: PhysicalOrderFilters): Promise<{
        data: OrderItemPhysical[];
        total: number;
        page: number;
        limit: number;
        total_pages: number;
        has_next: boolean;
        has_prev: boolean;
    }>;
    adminListRefundRequests(): Promise<RefundRequest[]>;
    updateShippingAddress(input: {
        orderId: string;
        actorId: string;
        actorRole: string;
        address: {
            full_name: string;
            phone: string;
            address_line_1: string;
            address_line_2?: string | null;
            city: string;
            state: string;
            postal_code: string;
            country_code: string;
        };
    }): Promise<import("../../../common/types/commerce.types").Order>;
    generateInvoice(input: {
        orderId: string;
        orderNumber: string;
        buyerId: string;
        sellerId: string;
        generatedBy: string;
        trigger: OrderInvoice["trigger"];
    }): Promise<OrderInvoice | null>;
    generateReceipt(input: {
        orderId: string;
        orderNumber: string;
        buyerId: string;
        generatedBy: string;
    }): Promise<OrderReceipt | null>;
    notifyAutoCancel(physicalId: string, orderId: string): Promise<void>;
    _adminSimpleTransition(input: {
        physicalId: string;
        actorId: string;
        newStatus: TimelineStatus;
        eventNotes: string;
        metadata?: Record<string, unknown>;
    }): Promise<OrderItemPhysical>;
    _resolveBuyerView(view: BuyerOrderView, filters: PhysicalOrderFilters): PhysicalOrderFilters;
    _resolveArtistView(view: ArtistOrderView, filters: PhysicalOrderFilters): Promise<{
        filters: PhysicalOrderFilters;
        __empty?: true;
    }>;
};
//# sourceMappingURL=physical-order.service.d.ts.map