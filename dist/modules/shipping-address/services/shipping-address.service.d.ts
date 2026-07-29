import type { ShippingAddress, CreateShippingAddressInput } from '../../../common/types/commerce.types';
export declare const shippingAddressService: {
    list(userId: string): Promise<ShippingAddress[]>;
    get(id: string, userId: string): Promise<ShippingAddress>;
    create(userId: string, input: CreateShippingAddressInput): Promise<ShippingAddress>;
    update(id: string, userId: string, input: Partial<Omit<CreateShippingAddressInput, "is_default">>): Promise<ShippingAddress>;
    setDefault(id: string, userId: string): Promise<ShippingAddress>;
    remove(id: string, userId: string): Promise<void>;
};
//# sourceMappingURL=shipping-address.service.d.ts.map