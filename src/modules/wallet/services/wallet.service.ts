import { v4 as uuidv4 } from 'uuid'
import { walletRepository } from '../repositories/wallet.repository'
import { userRepository } from '@/modules/auth/repositories/user.repository'
import { notificationService } from '@/modules/messaging/services/notification.service'
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '@/common/errors'
import { WITHDRAWAL_TRANSITIONS } from '@/common/types/wallet.types'
import { compact } from '@/common/utils/object.utils'
import type {
  WithdrawalRequest,
  WithdrawalStatus,
  WithdrawalDestinationType,
  WithdrawalDestinationDetails,
  WalletBalanceSummary,
  WalletLedgerFilters,
} from '@/common/types/wallet.types'
import type { WalletLedgerEntry, PaginatedResult } from '@/common/types/commerce.types'
import { config } from '@/config'

// ── Destination validation ──────────────────────────────────────────────────────
// No payout provider is integrated — this only validates shape so the admin
// has enough information to execute the transfer manually.

function assertValidDestination(
  type: WithdrawalDestinationType,
  details: WithdrawalDestinationDetails
): void {
  if (type === 'WALLET_ADDRESS') {
    if (!details.wallet_address || details.wallet_address.trim().length < 10) {
      throw new ValidationError('Validation failed', {
        wallet_address: 'A valid wallet_address is required for WALLET_ADDRESS withdrawals',
      })
    }
    if (!details.network) {
      throw new ValidationError('Validation failed', { network: 'network is required' })
    }
    return
  }

  if (type === 'BANK_ACCOUNT') {
    const missing: Record<string, string> = {}
    if (!details.bank_name)      missing['bank_name']      = 'bank_name is required'
    if (!details.account_name)   missing['account_name']   = 'account_name is required'
    if (!details.account_number) missing['account_number'] = 'account_number is required'
    if (Object.keys(missing).length) throw new ValidationError('Validation failed', missing)
    return
  }
}

function assertTransition(from: WithdrawalStatus, to: WithdrawalStatus): void {
  if (!WITHDRAWAL_TRANSITIONS[from].includes(to)) {
    throw new ConflictError(`Cannot transition withdrawal from ${from} to ${to}`)
  }
}

export const walletService = {
  // ── GetBalanceSummary ─────────────────────────────────────────────────────

  async getBalanceSummary(userId: string): Promise<WalletBalanceSummary> {
    return walletRepository.getBalanceSummary(userId)
  },

  // ── ListLedger ─────────────────────────────────────────────────────────────

  async listLedger(
    userId: string,
    filters: WalletLedgerFilters
  ): Promise<PaginatedResult<WalletLedgerEntry>> {
    return walletRepository.listLedger(userId, filters)
  },

  // ── RequestWithdrawal ────────────────────────────────────────────────────────

  async requestWithdrawal(input: {
    userId: string
    amount: number
    destinationType: WithdrawalDestinationType
    destinationDetails: WithdrawalDestinationDetails
    idempotencyKey?: string
  }): Promise<WithdrawalRequest> {
    if (input.amount < config.wallet.minWithdrawalAmount) {
      throw new ValidationError('Validation failed', {
        amount: `Minimum withdrawal amount is ${config.wallet.minWithdrawalAmount}`,
      })
    }

    assertValidDestination(input.destinationType, input.destinationDetails)

    try {
      const request = await walletRepository.requestWithdrawal({
        userId:             input.userId,
        amount:             input.amount,
        destinationType:    input.destinationType,
        destinationDetails: input.destinationDetails,
        idempotencyKey:     input.idempotencyKey ?? uuidv4(),
      })

      void notificationService.create({
        recipientId: input.userId,
        actorId:     null,
        type:        'system',
        entityId:    request.id,
        entityType:  'withdrawal_request',
        data:        { body: `Your withdrawal request for ${request.amount} ${request.currency} has been received and is pending review.` },
      }).catch(() => {})

      return request
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('insufficient_balance')) {
        throw new ValidationError('Validation failed', {
          amount: 'Requested amount exceeds your available balance',
        })
      }
      if (err instanceof Error && err.message.includes('invalid_amount')) {
        throw new ValidationError('Validation failed', {
          amount: 'Withdrawal amount must be positive',
        })
      }
      throw err
    }
  },

  // ── ListMyWithdrawals ────────────────────────────────────────────────────────

  async listMyWithdrawals(
    userId: string,
    filters: { status?: WithdrawalStatus; page?: number; limit?: number }
  ): Promise<PaginatedResult<WithdrawalRequest>> {
    return walletRepository.listWithdrawals({ ...filters, userId })
  },

  // ── CancelMyWithdrawal ────────────────────────────────────────────────────────
  // Self-service — only while still PENDING (before an admin has started
  // processing it).

  async cancelMyWithdrawal(userId: string, requestId: string): Promise<WithdrawalRequest> {
    const existing = await walletRepository.findWithdrawalById(requestId)
    if (!existing) throw new NotFoundError('Withdrawal request')
    if (existing.user_id !== userId) throw new ForbiddenError()
    assertTransition(existing.status, 'CANCELLED')

    return walletRepository.transitionWithdrawal({
      requestId,
      newStatus: 'CANCELLED',
      actorId:   userId,
      notes:     'Cancelled by requester',
    })
  },

  // ── Admin: ListWithdrawals ────────────────────────────────────────────────────

  async adminListWithdrawals(filters: {
    userId?: string
    status?: WithdrawalStatus
    page?: number
    limit?: number
  }): Promise<PaginatedResult<WithdrawalRequest>> {
    return walletRepository.listWithdrawals(filters)
  },

  // ── Admin: TransitionWithdrawal ───────────────────────────────────────────────
  // No PSP call is made — the admin performs the payout manually off-platform
  // and then marks it PROCESSING → COMPLETED here (or REJECTED/FAILED, which
  // reverses the reservation back into the artist's available balance).

  async adminTransitionWithdrawal(input: {
    requestId: string
    newStatus: WithdrawalStatus
    adminId: string
    notes?: string
  }): Promise<WithdrawalRequest> {
    const existing = await walletRepository.findWithdrawalById(input.requestId)
    if (!existing) throw new NotFoundError('Withdrawal request')
    assertTransition(existing.status, input.newStatus)

    const updated = await walletRepository.transitionWithdrawal({
      requestId: input.requestId,
      newStatus: input.newStatus,
      actorId:   input.adminId,
      ...compact({ notes: input.notes }),
    })

    const statusMessages: Partial<Record<WithdrawalStatus, string>> = {
      PROCESSING: `Your withdrawal of ${updated.amount} ${updated.currency} is now processing.`,
      COMPLETED:  `Your withdrawal of ${updated.amount} ${updated.currency} has been completed.`,
      REJECTED:   `Your withdrawal of ${updated.amount} ${updated.currency} was rejected and the funds have been returned to your available balance.`,
      FAILED:     `Your withdrawal of ${updated.amount} ${updated.currency} failed and the funds have been returned to your available balance.`,
    }
    const message = statusMessages[input.newStatus]
    if (message) {
      void notificationService.create({
        recipientId: updated.user_id,
        actorId:     input.adminId,
        type:        'system',
        entityId:    updated.id,
        entityType:  'withdrawal_request',
        data:        { body: message },
      }).catch(() => {})
    }

    return updated
  },

  // ── Admin: ValidateArtistExists ───────────────────────────────────────────────

  async assertArtistExists(userId: string): Promise<void> {
    const user = await userRepository.findById(userId)
    if (!user) throw new NotFoundError('User')
  },
}
