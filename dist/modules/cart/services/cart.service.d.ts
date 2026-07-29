import type { Cart, CartItemWithArtwork, AddToCartInput, UpdateCartItemInput } from '../../../common/types/commerce.types';
export declare const cartService: {
    getCart(userId: string): Promise<Cart>;
    addItem(userId: string, input: AddToCartInput): Promise<Cart>;
    updateQuantity(userId: string, itemId: string, input: UpdateCartItemInput): Promise<Cart>;
    removeItem(userId: string, itemId: string): Promise<Cart>;
    clearCart(userId: string): Promise<void>;
    validateItemsForCheckout(userId: string, cartItemIds: string[]): Promise<Array<CartItemWithArtwork & {
        effective_price: number;
    }>>;
};
//# sourceMappingURL=cart.service.d.ts.map