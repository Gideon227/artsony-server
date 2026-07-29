import type { SellerRegistration, SubmitSellerRegistrationInput, UpdateSellerRegistrationInput, SellerRegistrationFilters } from '../../../common/types/seller.types';
import type { PaginatedResult } from '../../../common/types/commerce.types';
type AuthContext = {
    ipAddress: string | null;
    userAgent: string | null;
};
export declare function submitRegistration(userId: string, input: SubmitSellerRegistrationInput, ctx: AuthContext): Promise<SellerRegistration>;
export declare function getMyRegistration(userId: string): Promise<SellerRegistration>;
export declare function updateMyRegistration(userId: string, input: UpdateSellerRegistrationInput): Promise<SellerRegistration>;
export declare function getRegistrationById(id: string): Promise<SellerRegistration>;
export declare function listRegistrations(filters: SellerRegistrationFilters): Promise<PaginatedResult<SellerRegistration>>;
export declare function approveRegistration(id: string, adminId: string, notes: string | undefined, ctx: AuthContext): Promise<SellerRegistration>;
export declare function rejectRegistration(id: string, adminId: string, notes: string | undefined, ctx: AuthContext): Promise<SellerRegistration>;
export declare function suspendRegistration(id: string, adminId: string, notes: string | undefined, ctx: AuthContext): Promise<SellerRegistration>;
export declare function reactivateRegistration(id: string, adminId: string, notes: string | undefined, ctx: AuthContext): Promise<SellerRegistration>;
export {};
//# sourceMappingURL=seller.service.d.ts.map