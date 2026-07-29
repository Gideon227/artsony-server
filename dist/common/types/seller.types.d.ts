export type SellerRegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type SellerRegistration = {
    id: string;
    user_id: string;
    full_name: string;
    username: string;
    email: string;
    phone_number: string;
    address: string;
    state: string;
    country: string;
    postal_code: string | null;
    status: SellerRegistrationStatus;
    reviewed_by: string | null;
    review_notes: string | null;
    created_at: Date;
    updated_at: Date;
};
export type SubmitSellerRegistrationInput = {
    full_name: string;
    username: string;
    email: string;
    phone_number: string;
    address: string;
    state: string;
    country: string;
    postal_code?: string;
};
export type UpdateSellerRegistrationInput = Partial<SubmitSellerRegistrationInput>;
export type SellerRegistrationFilters = {
    status?: SellerRegistrationStatus;
    page?: number;
    limit?: number;
};
export declare const SELLER_REGISTRATION_TRANSITIONS: Record<SellerRegistrationStatus, SellerRegistrationStatus[]>;
//# sourceMappingURL=seller.types.d.ts.map