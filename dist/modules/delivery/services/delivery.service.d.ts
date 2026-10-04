import type { DigitalDeliveryToken, DigitalDeliveryTokenWithArtwork, OrderItem } from '../../../common/types/commerce.types';
export declare const deliveryService: {
    generateTokensForOrder(orderId: string, buyerId: string): Promise<DigitalDeliveryToken[]>;
    validateAndRedeem(rawToken: string, requesterId: string): Promise<{
        signed_url: string;
        filename: string;
        expires_at: Date;
    }>;
    getDownloadForOrderItem(orderItemId: string, requesterId: string): Promise<{
        signed_url: string;
        filename: string;
        expires_at: Date;
    }>;
    getMyDownloads(buyerId: string): Promise<DigitalDeliveryTokenWithArtwork[]>;
    _redeem(tokenRecord: DigitalDeliveryToken): Promise<{
        signed_url: string;
        filename: string;
        expires_at: Date;
    }>;
    _issueToken(item: OrderItem, buyerId: string): Promise<DigitalDeliveryToken>;
};
//# sourceMappingURL=delivery.service.d.ts.map