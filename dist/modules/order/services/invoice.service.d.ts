import type { OrderInvoice, OrderReceipt } from '../../../common/types/commerce.types';
export declare const invoiceService: {
    generate(input: {
        order_id: string;
        order_number: string;
        purchase_date: Date;
        buyer: {
            id: string;
            username: string;
        };
        seller: {
            id: string;
            username: string;
        };
        items: Array<{
            title: string;
            unit_price: number;
            shipping_cost: number;
            courier_name: string | null;
            service_type: string | null;
        }>;
        currency: string;
        refund_amount: number | null;
        refund_status: string;
        generated_by: string;
        trigger: OrderInvoice["trigger"];
    }): Promise<OrderInvoice>;
    getLatest(orderId: string): Promise<OrderInvoice | null>;
};
export declare const receiptService: {
    /**
     * Generates and persists the single, immutable payment receipt for an
     * order. Idempotent — if a receipt already exists, the existing one is
     * returned and no new PDF is generated (createReceipt enforces this at
     * the repository layer via the order_id unique constraint).
     */
    generate(input: {
        order_id: string;
        order_number: string;
        payment_date: Date;
        buyer: {
            id: string;
            username: string;
        };
        amount_paid: number;
        currency: string;
        payment_method: string;
        transaction_reference: string | null;
        generated_by: string;
    }): Promise<OrderReceipt>;
    getLatest(orderId: string): Promise<OrderReceipt | null>;
};
//# sourceMappingURL=invoice.service.d.ts.map