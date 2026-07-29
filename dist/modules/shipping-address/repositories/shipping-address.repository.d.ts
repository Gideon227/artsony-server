import type { ShippingAddress, CreateShippingAddressInput } from '../../../common/types/commerce.types';
export declare const shippingAddressRepository: {
    listByUser(userId: string): Promise<ShippingAddress[]>;
    findById(id: string, userId: string): Promise<ShippingAddress | undefined>;
    create(userId: string, input: CreateShippingAddressInput): Promise<ShippingAddress>;
    update(id: string, userId: string, input: Partial<Omit<CreateShippingAddressInput, "is_default">>): Promise<ShippingAddress | undefined>;
    setDefault(id: string, userId: string): Promise<ShippingAddress | undefined>;
    delete(id: string, userId: string): Promise<boolean>;
};
//# sourceMappingURL=shipping-address.repository.d.ts.map