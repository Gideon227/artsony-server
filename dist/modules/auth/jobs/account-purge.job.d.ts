/**
 * Schedules the one-shot purge for an account, timed to its grace period.
 * Called by deleteAccount() immediately after soft-deleting the user.
 * Job ID is deterministic so re-scheduling (e.g. if deleteAccount were ever
 * called twice for the same user) is idempotent rather than stacking jobs.
 */
export declare function scheduleAccountPurge(userId: string): Promise<void>;
/**
 * Cancels a pending purge — for a future "restore my account" flow.
 * No such flow exists yet (the deletion email currently just says to
 * contact support), but this mirrors cancelConfirmationTimeout's symmetric
 * shape so it's a drop-in once one does.
 */
export declare function cancelAccountPurge(userId: string): Promise<void>;
/**
 * Starts the recurring sweep. Called once at app startup (see server.ts).
 * Runs daily — catches accounts whose one-shot job was lost, and the
 * backlog of accounts soft-deleted before this purge mechanism existed.
 */
export declare function startAccountPurgeSweep(): Promise<void>;
//# sourceMappingURL=account-purge.job.d.ts.map