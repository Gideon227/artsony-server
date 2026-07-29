import type { SellerRegistration, SubmitSellerRegistrationInput, UpdateSellerRegistrationInput, SellerRegistrationFilters, SellerRegistrationStatus } from '../../../common/types/seller.types';
import type { PaginatedResult } from '../../../common/types/commerce.types';
export declare const sellerRepository: {
    findByUserId(userId: string): Promise<SellerRegistration | undefined>;
    findById(id: string): Promise<SellerRegistration | undefined>;
    list(filters: SellerRegistrationFilters): Promise<PaginatedResult<SellerRegistration>>;
    submit(userId: string, input: SubmitSellerRegistrationInput): Promise<SellerRegistration>;
    updatePendingByUser(userId: string, input: UpdateSellerRegistrationInput): Promise<SellerRegistration | undefined>;
    transition(registrationId: string, newStatus: SellerRegistrationStatus, adminId: string, notes?: string): Promise<SellerRegistration>;
};
//# sourceMappingURL=seller.repository.d.ts.map