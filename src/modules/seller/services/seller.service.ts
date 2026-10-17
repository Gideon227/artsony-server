import { sellerRepository } from '../repositories/seller.repository'
import { sellerEmailVerificationService } from './seller-email-verification.service'
import type { EmailCodeReceipt } from './seller-email-verification.service'
import { auditRepository } from '@/modules/auth/repositories/audit.repository'
import { notificationService } from '@/modules/messaging/services/notification.service'
import { emailService } from '@/modules/email/email.service'
import type { SellerApplicationEmailKind } from '@/modules/email/email.service'
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  AppError,
} from '@/common/errors'
import type { UserRole } from '@/common/types'
import {
  SELLER_REGISTRATION_TRANSITIONS,
} from '@/common/types/seller.types'
import type {
  SellerRegistration,
  SubmitSellerRegistrationInput,
  UpdateSellerRegistrationInput,
  SellerRegistrationFilters,
  SellerRegistrationStatus,
} from '@/common/types/seller.types'
import type { PaginatedResult } from '@/common/types/commerce.types'

type AuthContext = {
  ipAddress: string | null
  userAgent: string | null
}

// ── Error-code narrowing ──────────────────────────────────────────────────────
// Repositories in this codebase throw plain Error objects with a `.code`
// property attached (see seller.repository.ts) rather than domain errors —
// that translation happens here, in the service layer.

function hasErrorCode(err: unknown): err is { code?: string } {
  return typeof err === 'object' && err !== null && 'code' in err
}

// ── Submit / Resubmit ──────────────────────────────────────────────────────────

// Staff accounts are never promoted/demoted through the seller flow:
// transition_seller_registration() rewrites users.role to ARTIST / USER, which
// would silently strip an admin or moderator of their role.
async function assertCanApply(
  userId: string,
  role: UserRole,
): Promise<SellerRegistration | undefined> {
  if (role === 'ADMIN' || role === 'MODERATOR') {
    throw new ForbiddenError('Staff accounts cannot register as sellers')
  }

  const existing = await sellerRepository.findByUserId(userId)
  if (existing && existing.status !== 'REJECTED') {
    throw new ConflictError(
      `You already have a seller registration (status: ${existing.status})`,
    )
  }
  return existing
}

export async function sendEmailVerificationCode(
  userId: string,
  role: UserRole,
  email: string,
): Promise<EmailCodeReceipt> {
  await assertCanApply(userId, role)
  return sellerEmailVerificationService.sendCode(userId, email)
}

export async function verifyEmailVerificationCode(
  userId: string,
  role: UserRole,
  email: string,
  code: string,
): Promise<void> {
  await assertCanApply(userId, role)
  await sellerEmailVerificationService.verifyCode(userId, email, code)
}

export async function submitRegistration(
  userId: string,
  role: UserRole,
  input: SubmitSellerRegistrationInput,
  ctx: AuthContext,
): Promise<SellerRegistration> {
  const existing = await assertCanApply(userId, role)
  await sellerEmailVerificationService.assertEmailVerified(userId, input.email)

  let registration: SellerRegistration
  try {
    registration = await sellerRepository.submit(userId, input, new Date())
  } catch (err) {
    if (hasErrorCode(err) && err.code === '23505') {
      throw new ConflictError('You already have a seller registration')
    }
    throw err
  }

  await sellerEmailVerificationService.clearProof(userId)

  auditRepository.log({
    userId,
    action: 'SELLER_REGISTRATION_SUBMITTED',
    ...(ctx.ipAddress && { ipAddress: ctx.ipAddress }),
    ...(ctx.userAgent && { userAgent: ctx.userAgent }),
    metadata: { registrationId: registration.id, resubmission: Boolean(existing) },
  })

  return registration
}

// ── Self-service read / edit ──────────────────────────────────────────────────

export async function getMyRegistration(userId: string): Promise<SellerRegistration> {
  const registration = await sellerRepository.findByUserId(userId)
  if (!registration) throw new NotFoundError('Seller registration')
  return registration
}

export async function updateMyRegistration(
  userId: string,
  input: UpdateSellerRegistrationInput,
): Promise<SellerRegistration> {
  const updated = await sellerRepository.updatePendingByUser(userId, input)
  if (updated) return updated

  // Guarded update matched no row — disambiguate why, without an extra
  // lookup on the (much more common) success path above.
  const existing = await sellerRepository.findByUserId(userId)
  if (!existing) throw new NotFoundError('Seller registration')
  throw new AppError(
    'Only a pending seller registration can be edited',
    409,
    'SELLER_REGISTRATION_NOT_PENDING',
  )
}

// Distinct endpoint from the above — see updateDispatchAddressByUser's
// comment for why this is scoped to APPROVED sellers and to
// address-only fields.
export async function updateDispatchAddress(
  userId: string,
  input: Partial<Pick<SellerRegistration, 'address' | 'state' | 'country' | 'city' | 'postal_code' | 'phone_number'>>,
): Promise<SellerRegistration> {
  const updated = await sellerRepository.updateDispatchAddressByUser(userId, input)
  if (updated) return updated

  const existing = await sellerRepository.findByUserId(userId)
  if (!existing) throw new NotFoundError('Seller registration')
  throw new AppError(
    existing.status === 'PENDING'
      ? 'Your seller application is still pending review — dispatch address updates are available once approved.'
      : 'Dispatch address can only be updated for an approved seller account.',
    409,
    'SELLER_NOT_APPROVED',
  )
}

// ── Admin: read ────────────────────────────────────────────────────────────────

export async function getRegistrationById(id: string): Promise<SellerRegistration> {
  const registration = await sellerRepository.findById(id)
  if (!registration) throw new NotFoundError('Seller registration')
  return registration
}

export async function listRegistrations(
  filters: SellerRegistrationFilters,
): Promise<PaginatedResult<SellerRegistration>> {
  return sellerRepository.list(filters)
}

// ── Admin: status transitions ─────────────────────────────────────────────────
// One shared implementation for approve / reject / suspend / reactivate.
//
// `allowedFrom` is deliberately specific per action (not just "is newStatus
// reachable from the current status" via SELLER_REGISTRATION_TRANSITIONS) —
// APPROVED is reachable from both PENDING and SUSPENDED, and without this
// distinction the /reactivate endpoint could silently approve a PENDING
// registration that was never suspended, or /approve could reinstate a
// SUSPENDED one. Each endpoint below passes exactly the starting state(s)
// that make sense for what it claims to do.
//
// SELLER_REGISTRATION_TRANSITIONS is still consulted as a second, generic
// check — belt-and-braces against this function's allowedFrom ever drifting
// out of sync with the state machine — and transition_seller_registration()
// re-validates the same table again inside the DB transaction as the
// authoritative, race-safe guard.

async function changeStatus(
  id: string,
  allowedFrom: SellerRegistrationStatus[],
  newStatus: SellerRegistrationStatus,
  adminId: string,
  notes: string | undefined,
  action: 'SELLER_REGISTRATION_APPROVED' | 'SELLER_REGISTRATION_REJECTED' |
          'SELLER_REGISTRATION_SUSPENDED' | 'SELLER_REGISTRATION_REACTIVATED',
  ctx: AuthContext,
): Promise<SellerRegistration> {
  const current = await sellerRepository.findById(id)
  if (!current) throw new NotFoundError('Seller registration')

  const generallyLegal = SELLER_REGISTRATION_TRANSITIONS[current.status].includes(newStatus)
  if (!allowedFrom.includes(current.status) || !generallyLegal) {
    throw new AppError(
      `Cannot move a ${current.status} registration to ${newStatus}`,
      409,
      'SELLER_REGISTRATION_INVALID_TRANSITION',
    )
  }

  let updated: SellerRegistration
  try {
    updated = await sellerRepository.transition(id, newStatus, adminId, notes)
  } catch {
    // Reaching here despite the pre-check above means another admin request
    // changed the status concurrently between our read and this write.
    throw new ConflictError(
      'This seller registration was modified by another request. Please refresh and try again.',
    )
  }

  auditRepository.log({
    userId: adminId,
    action,
    ...(ctx.ipAddress && { ipAddress: ctx.ipAddress }),
    ...(ctx.userAgent && { userAgent: ctx.userAgent }),
    metadata: {
      registrationId: id,
      targetUserId: updated.user_id,
      fromStatus: current.status,
      toStatus: newStatus,
      notes,
    },
  })

  void notifyApplicant(updated, action, notes)

  return updated
}

const NOTIFICATION_COPY: Record<SellerApplicationEmailKind, string> = {
  APPROVED: 'Your seller application was approved. You can now create and sell artwork.',
  REJECTED: "Your seller application wasn't approved. You can update your details and apply again.",
  SUSPENDED: 'Your seller account has been suspended and your marketplace listings are paused.',
  REACTIVATED: 'Your seller account has been reactivated and your listings are live again.',
}

const KIND_BY_ACTION: Record<
  'SELLER_REGISTRATION_APPROVED' | 'SELLER_REGISTRATION_REJECTED' |
  'SELLER_REGISTRATION_SUSPENDED' | 'SELLER_REGISTRATION_REACTIVATED',
  SellerApplicationEmailKind
> = {
  SELLER_REGISTRATION_APPROVED: 'APPROVED',
  SELLER_REGISTRATION_REJECTED: 'REJECTED',
  SELLER_REGISTRATION_SUSPENDED: 'SUSPENDED',
  SELLER_REGISTRATION_REACTIVATED: 'REACTIVATED',
}

// The status change is already committed by the time this runs, so a failed
// notification must never fail the admin's request — it is logged instead.
async function notifyApplicant(
  registration: SellerRegistration,
  action: keyof typeof KIND_BY_ACTION,
  notes: string | undefined,
): Promise<void> {
  const kind = KIND_BY_ACTION[action]

  const results = await Promise.allSettled([
    notificationService.create({
      recipientId: registration.user_id,
      actorId: null,
      type: 'system',
      entityId: registration.id,
      entityType: 'seller_registration',
      data: {
        body: NOTIFICATION_COPY[kind],
        status: registration.status,
        ...(notes?.trim() && { notes: notes.trim() }),
      },
    }),
    emailService.sendSellerApplicationUpdate({
      to: registration.email,
      name: registration.full_name,
      kind,
      notes: notes ?? null,
    }),
  ])

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(`[sellerService] ${kind} applicant notification failed:`, result.reason)
    }
  }
}

// Initial review only — a registration that has already been through the
// suspend/reactivate cycle must use reactivateRegistration() instead, even
// though both ultimately set the same APPROVED status.
export function approveRegistration(
  id: string,
  adminId: string,
  notes: string | undefined,
  ctx: AuthContext,
): Promise<SellerRegistration> {
  return changeStatus(id, ['PENDING'], 'APPROVED', adminId, notes, 'SELLER_REGISTRATION_APPROVED', ctx)
}

// Reachable from PENDING (initial review) or SUSPENDED (permanent removal
// after a suspension) — the two edge cases the brief calls out explicitly
// ("artwork already exists when seller becomes suspended or rejected").
export function rejectRegistration(
  id: string,
  adminId: string,
  notes: string | undefined,
  ctx: AuthContext,
): Promise<SellerRegistration> {
  return changeStatus(id, ['PENDING', 'SUSPENDED'], 'REJECTED', adminId, notes, 'SELLER_REGISTRATION_REJECTED', ctx)
}

export function suspendRegistration(
  id: string,
  adminId: string,
  notes: string | undefined,
  ctx: AuthContext,
): Promise<SellerRegistration> {
  return changeStatus(id, ['APPROVED'], 'SUSPENDED', adminId, notes, 'SELLER_REGISTRATION_SUSPENDED', ctx)
}

// Only reachable from SUSPENDED — see approveRegistration() above for why
// this is a distinct function from the initial-approval path despite both
// setting status to APPROVED.
export function reactivateRegistration(
  id: string,
  adminId: string,
  notes: string | undefined,
  ctx: AuthContext,
): Promise<SellerRegistration> {
  return changeStatus(id, ['SUSPENDED'], 'APPROVED', adminId, notes, 'SELLER_REGISTRATION_REACTIVATED', ctx)
}