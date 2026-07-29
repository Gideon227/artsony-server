import Bull from 'bull';
export declare const orderConfirmationQueue: Bull.Queue<{
    physicalId: string;
    orderId: string;
}>;
export declare function scheduleConfirmationTimeout(physicalId: string, orderId: string): Promise<void>;
export declare function cancelConfirmationTimeout(physicalId: string): Promise<void>;
//# sourceMappingURL=order-confirmation-timeout.job.d.ts.map