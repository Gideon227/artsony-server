import { supabase, assertNoError } from '@/config/database'
import type {
  WithdrawalRequest,
  WithdrawalStatus,
  WithdrawalDestinationType,
  WithdrawalDestinationDetails,
  WalletBalanceSummary,
  WalletLedgerFilters,
} from '@/common/types/wallet.types'
import type { WalletLedgerEntry, WalletLedgerEntryType, WalletLedgerCategory, WalletLedgerHoldStatus } from '@/common/types/commerce.types'
import type { PaginatedResult } from '@/common/types/commerce.types'

// ── Row → Domain mappers ──────────────────────────────────────────────────────

function toWithdrawal(row: any): WithdrawalRequest {
  return {
    id:                   row['id'],
    user_id:              row['user_id'],
    amount:               Number(row['amount']),
    currency:             row['currency'],
    status:               row['status'] as WithdrawalStatus,
    destination_type:     row['destination_type'] as WithdrawalDestinationType,
    destination_details:  (row['destination_details'] ?? {}) as WithdrawalDestinationDetails,
    idempotency_key:      row['idempotency_key'],
    admin_notes:          row['admin_notes'] ?? null,
    reviewed_by:          row['reviewed_by'] ?? null,
    reviewed_at:          row['reviewed_at'] ? new Date(row['reviewed_at']) : null,
    completed_at:         row['completed_at'] ? new Date(row['completed_at']) : null,
    created_at:           new Date(row['created_at']),
    updated_at:           new Date(row['updated_at']),
  }
}

function toLedgerEntry(row: any): WalletLedgerEntry {
  return {
    id:                     row['id'],
    user_id:                row['user_id'],
    transaction_id:         row['transaction_id'] ?? null,
    order_id:               row['order_id'] ?? null,
    order_item_id:          row['order_item_id'] ?? null,
    withdrawal_request_id:  row['withdrawal_request_id'] ?? null,
    type:                   row['type'] as WalletLedgerEntryType,
    category:               row['category'] as WalletLedgerCategory,
    hold_status:            row['hold_status'] as WalletLedgerHoldStatus,
    available_at:           row['available_at'] ? new Date(row['available_at']) : null,
    amount:                 Number(row['amount']),
    balance_after:          Number(row['balance_after']),
    description:            row['description'],
    created_at:             new Date(row['created_at']),
  }
}

export const walletRepository = {
  // ── GetBalanceSummary ─────────────────────────────────────────────────────
  // Single source of truth (see get_artist_balance_summary SQL function) —
  // also used to validate withdrawal requests, so display and validation
  // can never disagree.

  async getBalanceSummary(userId: string): Promise<WalletBalanceSummary> {
    const result = await (supabase() as any).rpc('get_artist_balance_summary', {
      p_user_id: userId,
    })

    if (result.error) {
      throw new Error(`[Supabase:wallet.getBalanceSummary] ${result.error.message}`)
    }

    const row = (result.data ?? [])[0] ?? {}
    return {
      available_balance: Number(row['available_balance'] ?? 0),
      pending_balance:    Number(row['pending_balance'] ?? 0),
      hold_balance:        Number(row['hold_balance'] ?? 0),
      total_withdrawn:    Number(row['total_withdrawn'] ?? 0),
      total_earned:       Number(row['total_earned'] ?? 0),
      currency:           'USDT',
    }
  },

  // ── ListLedger ─────────────────────────────────────────────────────────────

  async listLedger(
    userId: string,
    filters: WalletLedgerFilters
  ): Promise<PaginatedResult<WalletLedgerEntry>> {
    const page  = Math.max(1, filters.page ?? 1)
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20))
    const from  = (page - 1) * limit
    const to    = from + limit - 1

    let query = (supabase() as any)
      .from('wallet_ledger')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)

    if (filters.category)    query = query.eq('category', filters.category)
    if (filters.hold_status) query = query.eq('hold_status', filters.hold_status)
    if (filters.date_from)   query = query.gte('created_at', filters.date_from)
    if (filters.date_to)     query = query.lte('created_at', filters.date_to)

    query = query.order('created_at', { ascending: false }).range(from, to)

    const result = await query
    if (result.error) {
      throw new Error(`[Supabase:wallet.listLedger] ${result.error.message}`)
    }

    const total       = result.count ?? 0
    const total_pages = Math.ceil(total / limit)

    return {
      data:        (result.data ?? []).map(toLedgerEntry),
      total,
      page,
      limit,
      total_pages,
      has_next:    page < total_pages,
      has_prev:    page > 1,
    }
  },

  // ── RequestWithdrawal ────────────────────────────────────────────────────────
  // Atomic — see request_withdrawal() SQL function. Throws on insufficient
  // balance; the service layer translates that into a ValidationError.

  async requestWithdrawal(input: {
    userId: string
    amount: number
    destinationType: WithdrawalDestinationType
    destinationDetails: WithdrawalDestinationDetails
    idempotencyKey: string
  }): Promise<WithdrawalRequest> {
    const result = await (supabase() as any).rpc('request_withdrawal', {
      p_user_id:             input.userId,
      p_amount:              input.amount,
      p_destination_type:    input.destinationType,
      p_destination_details: input.destinationDetails,
      p_idempotency_key:     input.idempotencyKey,
    })

    if (result.error) {
      throw result.error
    }

    const row = (result.data ?? [])[0]
    if (!row) throw new Error('[Supabase:wallet.requestWithdrawal] No row returned')
    return toWithdrawal(row)
  },

  // ── TransitionWithdrawal ──────────────────────────────────────────────────────

  async transitionWithdrawal(input: {
    requestId: string
    newStatus: WithdrawalStatus
    actorId: string
    notes?: string
  }): Promise<WithdrawalRequest> {
    const result = await (supabase() as any).rpc('transition_withdrawal', {
      p_request_id: input.requestId,
      p_new_status: input.newStatus,
      p_actor_id:   input.actorId,
      p_notes:      input.notes ?? null,
    })

    if (result.error) {
      throw result.error
    }

    const row = (result.data ?? [])[0]
    if (!row) throw new Error('[Supabase:wallet.transitionWithdrawal] No row returned')
    return toWithdrawal(row)
  },

  // ── FindWithdrawalById ────────────────────────────────────────────────────────

  async findWithdrawalById(id: string): Promise<WithdrawalRequest | undefined> {
    const result = await (supabase() as any)
      .from('withdrawal_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'wallet.findWithdrawalById')
    return toWithdrawal(result.data)
  },

  // ── ListWithdrawals ────────────────────────────────────────────────────────────
  // userId undefined ⇒ admin view across all artists.

  async listWithdrawals(filters: {
    userId?: string
    status?: WithdrawalStatus
    page?: number
    limit?: number
  }): Promise<PaginatedResult<WithdrawalRequest>> {
    const page  = Math.max(1, filters.page ?? 1)
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20))
    const from  = (page - 1) * limit
    const to    = from + limit - 1

    let query = (supabase() as any)
      .from('withdrawal_requests')
      .select('*', { count: 'exact' })

    if (filters.userId) query = query.eq('user_id', filters.userId)
    if (filters.status) query = query.eq('status', filters.status)

    query = query.order('created_at', { ascending: false }).range(from, to)

    const result = await query
    if (result.error) {
      throw new Error(`[Supabase:wallet.listWithdrawals] ${result.error.message}`)
    }

    const total       = result.count ?? 0
    const total_pages = Math.ceil(total / limit)

    return {
      data:        (result.data ?? []).map(toWithdrawal),
      total,
      page,
      limit,
      total_pages,
      has_next:    page < total_pages,
      has_prev:    page > 1,
    }
  },
}
