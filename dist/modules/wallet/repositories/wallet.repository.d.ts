import type { WithdrawalRequest, WithdrawalStatus, WithdrawalDestinationType, WithdrawalDestinationDetails, WalletBalanceSummary, WalletLedgerFilters } from '../../../common/types/wallet.types';
import type { WalletLedgerEntry } from '../../../common/types/commerce.types';
import type { PaginatedResult } from '../../../common/types/commerce.types';
export declare const walletRepository: {
    getBalanceSummary(userId: string): Promise<WalletBalanceSummary>;
    listLedger(userId: string, filters: WalletLedgerFilters): Promise<PaginatedResult<WalletLedgerEntry>>;
    requestWithdrawal(input: {
        userId: string;
        amount: number;
        destinationType: WithdrawalDestinationType;
        destinationDetails: WithdrawalDestinationDetails;
        idempotencyKey: string;
    }): Promise<WithdrawalRequest>;
    transitionWithdrawal(input: {
        requestId: string;
        newStatus: WithdrawalStatus;
        actorId: string;
        notes?: string;
    }): Promise<WithdrawalRequest>;
    findWithdrawalById(id: string): Promise<WithdrawalRequest | undefined>;
    listWithdrawals(filters: {
        userId?: string;
        status?: WithdrawalStatus;
        page?: number;
        limit?: number;
    }): Promise<PaginatedResult<WithdrawalRequest>>;
};
//# sourceMappingURL=wallet.repository.d.ts.map