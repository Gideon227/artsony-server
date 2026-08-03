// ── Enums (mirror SQL enum exactly) ──────────────────────────────────────────

export type SellerRegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'

// ── Core domain type ──────────────────────────────────────────────────────────

export type SellerRegistration = {
  id: string
  user_id: string
  full_name: string
  username: string
  email: string
  phone_number: string
  address: string
  state: string
  country: string
  postal_code: string | null
  status: SellerRegistrationStatus
  reviewed_by: string | null
  review_notes: string | null
  created_at: Date
  updated_at: Date
}

// ── Input DTOs ────────────────────────────────────────────────────────────────

export type SubmitSellerRegistrationInput = {
  full_name: string
  username: string
  email: string
  phone_number: string
  address: string
  state: string
  country: string
  postal_code?: string
}

export type UpdateSellerRegistrationInput = Partial<SubmitSellerRegistrationInput>

export type SellerRegistrationFilters = {
  status?: SellerRegistrationStatus
  page?: number
  limit?: number
}

// ── State machine ──────────────────────────────────────────────────────────────
// Authoritative in application code; transition_seller_registration() in
// 20240701000000_seller_registration_schema.sql carries the same table as a
// race-safe fallback enforced inside the DB transaction.
//
// REJECTED has no admin-reachable outbound transitions — resubmission back to
// PENDING is user-initiated via submit_seller_registration(), not an admin
// status change, so it is intentionally absent here.

export const SELLER_REGISTRATION_TRANSITIONS: Record<SellerRegistrationStatus, SellerRegistrationStatus[]> = {
  PENDING:   ['APPROVED', 'REJECTED'],
  APPROVED:  ['SUSPENDED'],
  REJECTED:  [],
  SUSPENDED: ['APPROVED', 'REJECTED'],
}
