import type { WalletLedgerCategory, WalletLedgerHoldStatus, WalletLedgerEntry } from './commerce.types'

// ── Withdrawal ─────────────────────────────────────────────────────────────────

export type WithdrawalStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'FAILED'
  | 'CANCELLED'

// No payment/payout provider is wired up yet — destination is stored only
// so an admin knows where to manually send funds. Shape is intentionally
// loose (validated at the service layer per destination_type) so a real
// payout integration can be added later without a schema change.
export type WithdrawalDestinationType = 'WALLET_ADDRESS' | 'BANK_ACCOUNT'

export type WithdrawalDestinationDetails = {
  // WALLET_ADDRESS
  network?:        'TRON' | 'ETHEREUM' | 'BSC'
  wallet_address?: string
  // BANK_ACCOUNT
  bank_name?:      string
  account_name?:   string
  account_number?: string
  routing_code?:   string
}

export type WithdrawalRequest = {
  id: string
  user_id: string
  amount: number
  currency: string
  status: WithdrawalStatus
  destination_type: WithdrawalDestinationType
  destination_details: WithdrawalDestinationDetails
  idempotency_key: string
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: Date | null
  completed_at: Date | null
  created_at: Date
  updated_at: Date
}

export const WITHDRAWAL_TRANSITIONS: Record<WithdrawalStatus, WithdrawalStatus[]> = {
  PENDING:    ['PROCESSING', 'REJECTED', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED:  [],
  REJECTED:   [],
  FAILED:     [],
  CANCELLED:  [],
}

// ── Balance summary ────────────────────────────────────────────────────────────

export type WalletBalanceSummary = {
  available_balance: number
  pending_balance: number
  hold_balance: number
  total_withdrawn: number
  total_earned: number
  currency: string
}

// ── Ledger listing ─────────────────────────────────────────────────────────────

export type WalletLedgerFilters = {
  category?: WalletLedgerCategory
  hold_status?: WalletLedgerHoldStatus
  date_from?: string
  date_to?: string
  page?: number
  limit?: number
}

export type { WalletLedgerEntry, WalletLedgerCategory, WalletLedgerHoldStatus }
