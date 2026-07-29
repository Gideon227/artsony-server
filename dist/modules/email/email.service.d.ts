export declare const emailService: {
    sendPasswordResetEmail(input: {
        to: string;
        resetUrl: string;
        expiryMinutes: number;
    }): Promise<void>;
    sendWelcomeEmail(input: {
        to: string;
        displayName: string;
    }): Promise<void>;
    sendEmailVerification(input: {
        to: string;
        verifyUrl: string;
    }): Promise<void>;
    sendOrderConfirmation(input: {
        to: string;
        orderId: string;
        items: Array<{
            artwork_title: string;
            artwork_thumbnail_url: string | null;
            artwork_format: string;
            unit_price: number;
            currency: string;
            quantity: number;
        }>;
        total: number;
        currency: string;
    }): Promise<void>;
    sendOrderShippedEmail(input: {
        to: string;
        orderId: string;
        artworkTitle: string;
    }): Promise<void>;
    sendAccountDeletionConfirmation(input: {
        to: string;
        displayName: string;
        scheduledAt: Date;
    }): Promise<void>;
};
//# sourceMappingURL=email.service.d.ts.map