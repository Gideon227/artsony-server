import type { Transaction, PaymentInstructions } from '../../../common/types/commerce.types';
export declare const paymentService: {
    getPaymentStatus(orderId: string, requesterId: string): Promise<{
        transaction: Transaction;
        payment_instructions: PaymentInstructions;
    }>;
    verifyTransaction(transactionId: string): Promise<void>;
    getRetryDelayMs(retryCount: number): number;
    _expireTransaction(tx: Transaction): Promise<void>;
    _getOrderIdForTransaction(transactionId: string): Promise<string>;
};
//# sourceMappingURL=payment.service.d.ts.map