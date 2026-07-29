import type { CartItem, CartItemWithArtwork, CartVariantSnapshot } from '../../../common/types/commerce.types';
export declare const cartRepository: {
    findByUser(userId: string): Promise<CartItemWithArtwork[]>;
    findItemById(itemId: string, userId: string): Promise<CartItem | undefined>;
    countByUser(userId: string): Promise<number>;
    findExistingLine(userId: string, artworkId: string, variantOptionId: string | null): Promise<CartItem | undefined>;
    upsert(payload: {
        user_id: string;
        artwork_id: string;
        quantity: number;
        price_at_add: number;
        currency_at_add: string;
        variant_snapshot: CartVariantSnapshot | null;
    }): Promise<CartItem>;
    insert(payload: {
        user_id: string;
        artwork_id: string;
        quantity: number;
        price_at_add: number;
        currency_at_add: string;
        variant_snapshot: CartVariantSnapshot | null;
    }): Promise<CartItem>;
    updateQuantity(itemId: string, userId: string, quantity: number): Promise<CartItem>;
    deleteItem(itemId: string, userId: string): Promise<void>;
    deleteItems(itemIds: string[], userId: string): Promise<void>;
    clearCart(userId: string): Promise<void>;
};
//# sourceMappingURL=cart.repository.d.ts.map