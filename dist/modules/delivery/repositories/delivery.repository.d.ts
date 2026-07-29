import type { DigitalDeliveryToken } from '../../../common/types/commerce.types';
export declare const deliveryRepository: {
    create(input: {
        order_item_id: string;
        artwork_id: string;
        buyer_id: string;
        token_hash: string;
        expires_at: Date;
        max_downloads: number;
    }): Promise<DigitalDeliveryToken>;
    findByHash(tokenHash: string): Promise<DigitalDeliveryToken | undefined>;
    findByOrderItem(orderItemId: string): Promise<DigitalDeliveryToken | undefined>;
    findByBuyer(buyerId: string): Promise<DigitalDeliveryToken[]>;
    recordDownload(tokenId: string): Promise<DigitalDeliveryToken>;
};
//# sourceMappingURL=delivery.repository.d.ts.map