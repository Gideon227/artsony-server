/**
 * Enqueues a verification job for a transaction.
 * Called by the order service after a buyer submits a tx_hash.
 * delay defaults to the first backoff slot (30s) for the initial check.
 */
export declare function scheduleVerification(transactionId: string, retryCount?: number, delayMs?: number): Promise<void>;
/**
 * Starts the recurring expiry job. Called once at app startup.
 * Runs every 5 minutes — finds PENDING/CONFIRMING transactions past
 * expires_at, cancels their orders, and releases stock.
 */
export declare function startExpireScheduler(): Promise<void>;
//# sourceMappingURL=payment.job.d.ts.map