import type { WithdrawalRequest, WithdrawalStatus, WithdrawalDestinationType, WithdrawalDestinationDetails, WalletBalanceSummary, WalletLedgerFilters } from '../../../common/types/wallet.types';
import type { WalletLedgerEntry, PaginatedResult } from '../../../common/types/commerce.types';
export declare const walletService: {
    getBalanceSummary(userId: string): Promise<WalletBalanceSummary>;
    listLedger(userId: string, filters: WalletLedgerFilters): Promise<PaginatedResult<WalletLedgerEntry>>;
    requestWithdrawal(input: {
        userId: string;
        amount: number;
        destinationType: WithdrawalDestinationType;
        destinationDetails: WithdrawalDestinationDetails;
        idempotencyKey?: string;
    }): Promise<WithdrawalRequest>;
    listMyWithdrawals(userId: string, filters: {
        status?: WithdrawalStatus;
        page?: number;
        limit?: number;
    }): Promise<PaginatedResult<WithdrawalRequest>>;
    cancelMyWithdrawal(userId: string, requestId: string): Promise<WithdrawalRequest>;
    adminListWithdrawals(filters: {
        userId?: string;
        status?: WithdrawalStatus;
        page?: number;
        limit?: number;
    }): Promise<PaginatedResult<WithdrawalRequest>>;
    adminTransitionWithdrawal(input: {
        requestId: string;
        newStatus: WithdrawalStatus;
        adminId: string;
        notes?: string;
    }): Promise<WithdrawalRequest>;
    assertArtistExists(userId: string): Promise<void>;
};
//# sourceMappingURL=wallet.service.d.ts.map