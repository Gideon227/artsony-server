import type { Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import { walletService } from '../services/wallet.service'
import { ValidationError, UnauthorizedError } from '@/common/errors'
import { compact } from '@/common/utils/object.utils'
import type { WalletLedgerCategory, WalletLedgerHoldStatus } from '@/common/types/commerce.types'
import type { WithdrawalDestinationType, WithdrawalDestinationDetails, WithdrawalStatus } from '@/common/types/wallet.types'

function assertValid(req: Request): void {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const fields = Object.fromEntries(
      errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg])
    )
    throw new ValidationError('Validation failed', fields)
  }
}

function requireAuth(req: Request): { sub: string; role: string } {
  if (!req.auth) throw new UnauthorizedError()
  return req.auth as { sub: string; role: string }
}

// ── Validation chains ────────────────────────────────────────────────────────────

export const requestWithdrawalValidation = [
  body('amount').isFloat({ gt: 0 }).withMessage('amount must be a positive number'),
  body('destination_type').isIn(['WALLET_ADDRESS', 'BANK_ACCOUNT']),
  body('destination_details').isObject(),
]

export const listLedgerValidation = [
  query('category').optional().isIn(['SALE', 'WITHDRAWAL', 'REFUND', 'ADJUSTMENT']),
  query('hold_status').optional().isIn(['PENDING_DELIVERY', 'ON_HOLD', 'AVAILABLE']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
]

export const transitionWithdrawalValidation = [
  param('id').isUUID(),
  body('status').isIn(['PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED']),
  body('notes').optional().isString().isLength({ max: 1000 }),
]

// ── Self-service handlers ─────────────────────────────────────────────────────

export async function handleGetBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub } = requireAuth(req)
    const summary = await walletService.getBalanceSummary(sub)
    res.json({ success: true, data: summary })
  } catch (err) {
    next(err)
  }
}

export async function handleListLedger(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { sub } = requireAuth(req)
    const q = req.query as Record<string, string | undefined>

    const result = await walletService.listLedger(sub, compact({
      category:    q['category'] as WalletLedgerCategory | undefined,
      hold_status: q['hold_status'] as WalletLedgerHoldStatus | undefined,
      date_from:   q['date_from'],
      date_to:     q['date_to'],
      page:        q['page'] ? Number(q['page']) : undefined,
      limit:       q['limit'] ? Number(q['limit']) : undefined,
    }))

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

export async function handleRequestWithdrawal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { sub } = requireAuth(req)
    const { amount, destination_type, destination_details, idempotency_key } = req.body as {
      amount: number
      destination_type: WithdrawalDestinationType
      destination_details: WithdrawalDestinationDetails
      idempotency_key?: string
    }

    const request = await walletService.requestWithdrawal({
      userId:             sub,
      amount,
      destinationType:    destination_type,
      destinationDetails: destination_details,
      ...compact({ idempotencyKey: idempotency_key }),
    })

    res.status(201).json({ success: true, data: request })
  } catch (err) {
    next(err)
  }
}

export async function handleListMyWithdrawals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub } = requireAuth(req)
    const q = req.query as Record<string, string | undefined>

    const result = await walletService.listMyWithdrawals(sub, compact({
      status: q['status'] as WithdrawalStatus | undefined,
      page:   q['page'] ? Number(q['page']) : undefined,
      limit:  q['limit'] ? Number(q['limit']) : undefined,
    }))

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

export async function handleCancelMyWithdrawal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub } = requireAuth(req)
    const { id } = req.params as { id: string }
    const request = await walletService.cancelMyWithdrawal(sub, id)
    res.json({ success: true, data: request })
  } catch (err) {
    next(err)
  }
}

// ── Admin handlers ────────────────────────────────────────────────────────────

export async function handleAdminListWithdrawals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = req.query as Record<string, string | undefined>

    const result = await walletService.adminListWithdrawals(compact({
      userId: q['user_id'],
      status: q['status'] as WithdrawalStatus | undefined,
      page:   q['page'] ? Number(q['page']) : undefined,
      limit:  q['limit'] ? Number(q['limit']) : undefined,
    }))

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

export async function handleAdminTransitionWithdrawal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const { sub } = requireAuth(req)
    const { id } = req.params as { id: string }
    const { status, notes } = req.body as { status: WithdrawalStatus; notes?: string }

    const request = await walletService.adminTransitionWithdrawal({
      requestId: id,
      newStatus: status,
      adminId:   sub,
      ...compact({ notes }),
    })

    res.json({ success: true, data: request })
  } catch (err) {
    next(err)
  }
}

export async function handleAdminGetArtistBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req.params as { userId: string }
    await walletService.assertArtistExists(userId)
    const summary = await walletService.getBalanceSummary(userId)
    res.json({ success: true, data: summary })
  } catch (err) {
    next(err)
  }
}
