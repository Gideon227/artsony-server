import type { DigitalDeliveryToken, OrderItem } from '../../../common/types/commerce.types';
export declare const deliveryService: {
    generateTokensForOrder(orderId: string, buyerId: string): Promise<DigitalDeliveryToken[]>;
    validateAndRedeem(rawToken: string, requesterId: string): Promise<{
        signed_url: string;
        filename: string;
        expires_at: Date;
    }>;
    getMyDownloads(buyerId: string): Promise<DigitalDeliveryToken[]>;
    _issueToken(item: OrderItem, buyerId: string): Promise<DigitalDeliveryToken>;
};
//# sourceMappingURL=delivery.service.d.ts.map