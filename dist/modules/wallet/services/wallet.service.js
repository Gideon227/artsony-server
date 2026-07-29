"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletService = void 0;
const uuid_1 = require("uuid");
const wallet_repository_1 = require("../repositories/wallet.repository");
const user_repository_1 = require("../../../modules/auth/repositories/user.repository");
const notification_service_1 = require("../../../modules/messaging/services/notification.service");
const errors_1 = require("../../../common/errors");
const wallet_types_1 = require("../../../common/types/wallet.types");
const object_utils_1 = require("../../../common/utils/object.utils");
const config_1 = require("../../../config");
// ── Destination validation ──────────────────────────────────────────────────────
// No payout provider is integrated — this only validates shape so the admin
// has enough information to execute the transfer manually.
function assertValidDestination(type, details) {
    if (type === 'WALLET_ADDRESS') {
        if (!details.wallet_address || details.wallet_address.trim().length < 10) {
            throw new errors_1.ValidationError('Validation failed', {
                wallet_address: 'A valid wallet_address is required for WALLET_ADDRESS withdrawals',
            });
        }
        if (!details.network) {
            throw new errors_1.ValidationError('Validation failed', { network: 'network is required' });
        }
        return;
    }
    if (type === 'BANK_ACCOUNT') {
        const missing = {};
        if (!details.bank_name)
            missing['bank_name'] = 'bank_name is required';
        if (!details.account_name)
            missing['account_name'] = 'account_name is required';
        if (!details.account_number)
            missing['account_number'] = 'account_number is required';
        if (Object.keys(missing).length)
            throw new errors_1.ValidationError('Validation failed', missing);
        return;
    }
}
function assertTransition(from, to) {
    if (!wallet_types_1.WITHDRAWAL_TRANSITIONS[from].includes(to)) {
        throw new errors_1.ConflictError(`Cannot transition withdrawal from ${from} to ${to}`);
    }
}
exports.walletService = {
    // ── GetBalanceSummary ─────────────────────────────────────────────────────
    async getBalanceSummary(userId) {
        return wallet_repository_1.walletRepository.getBalanceSummary(userId);
    },
    // ── ListLedger ─────────────────────────────────────────────────────────────
    async listLedger(userId, filters) {
        return wallet_repository_1.walletRepository.listLedger(userId, filters);
    },
    // ── RequestWithdrawal ────────────────────────────────────────────────────────
    async requestWithdrawal(input) {
        if (input.amount < config_1.config.wallet.minWithdrawalAmount) {
            throw new errors_1.ValidationError('Validation failed', {
                amount: `Minimum withdrawal amount is ${config_1.config.wallet.minWithdrawalAmount}`,
            });
        }
        assertValidDestination(input.destinationType, input.destinationDetails);
        try {
            const request = await wallet_repository_1.walletRepository.requestWithdrawal({
                userId: input.userId,
                amount: input.amount,
                destinationType: input.destinationType,
                destinationDetails: input.destinationDetails,
                idempotencyKey: input.idempotencyKey ?? (0, uuid_1.v4)(),
            });
            void notification_service_1.notificationService.create({
                recipientId: input.userId,
                actorId: null,
                type: 'system',
                entityId: request.id,
                entityType: 'withdrawal_request',
                data: { body: `Your withdrawal request for ${request.amount} ${request.currency} has been received and is pending review.` },
            }).catch(() => { });
            return request;
        }
        catch (err) {
            if (err instanceof Error && err.message.includes('insufficient_balance')) {
                throw new errors_1.ValidationError('Validation failed', {
                    amount: 'Requested amount exceeds your available balance',
                });
            }
            if (err instanceof Error && err.message.includes('invalid_amount')) {
                throw new errors_1.ValidationError('Validation failed', {
                    amount: 'Withdrawal amount must be positive',
                });
            }
            throw err;
        }
    },
    // ── ListMyWithdrawals ────────────────────────────────────────────────────────
    async listMyWithdrawals(userId, filters) {
        return wallet_repository_1.walletRepository.listWithdrawals({ ...filters, userId });
    },
    // ── CancelMyWithdrawal ────────────────────────────────────────────────────────
    // Self-service — only while still PENDING (before an admin has started
    // processing it).
    async cancelMyWithdrawal(userId, requestId) {
        const existing = await wallet_repository_1.walletRepository.findWithdrawalById(requestId);
        if (!existing)
            throw new errors_1.NotFoundError('Withdrawal request');
        if (existing.user_id !== userId)
            throw new errors_1.ForbiddenError();
        assertTransition(existing.status, 'CANCELLED');
        return wallet_repository_1.walletRepository.transitionWithdrawal({
            requestId,
            newStatus: 'CANCELLED',
            actorId: userId,
            notes: 'Cancelled by requester',
        });
    },
    // ── Admin: ListWithdrawals ────────────────────────────────────────────────────
    async adminListWithdrawals(filters) {
        return wallet_repository_1.walletRepository.listWithdrawals(filters);
    },
    // ── Admin: TransitionWithdrawal ───────────────────────────────────────────────
    // No PSP call is made — the admin performs the payout manually off-platform
    // and then marks it PROCESSING → COMPLETED here (or REJECTED/FAILED, which
    // reverses the reservation back into the artist's available balance).
    async adminTransitionWithdrawal(input) {
        const existing = await wallet_repository_1.walletRepository.findWithdrawalById(input.requestId);
        if (!existing)
            throw new errors_1.NotFoundError('Withdrawal request');
        assertTransition(existing.status, input.newStatus);
        const updated = await wallet_repository_1.walletRepository.transitionWithdrawal({
            requestId: input.requestId,
            newStatus: input.newStatus,
            actorId: input.adminId,
            ...(0, object_utils_1.compact)({ notes: input.notes }),
        });
        const statusMessages = {
            PROCESSING: `Your withdrawal of ${updated.amount} ${updated.currency} is now processing.`,
            COMPLETED: `Your withdrawal of ${updated.amount} ${updated.currency} has been completed.`,
            REJECTED: `Your withdrawal of ${updated.amount} ${updated.currency} was rejected and the funds have been returned to your available balance.`,
            FAILED: `Your withdrawal of ${updated.amount} ${updated.currency} failed and the funds have been returned to your available balance.`,
        };
        const message = statusMessages[input.newStatus];
        if (message) {
            void notification_service_1.notificationService.create({
                recipientId: updated.user_id,
                actorId: input.adminId,
                type: 'system',
                entityId: updated.id,
                entityType: 'withdrawal_request',
                data: { body: message },
            }).catch(() => { });
        }
        return updated;
    },
    // ── Admin: ValidateArtistExists ───────────────────────────────────────────────
    async assertArtistExists(userId) {
        const user = await user_repository_1.userRepository.findById(userId);
        if (!user)
            throw new errors_1.NotFoundError('User');
    },
};
//# sourceMappingURL=wallet.service.js.map