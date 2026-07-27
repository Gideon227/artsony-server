import { Router } from 'express'
import { requireAuth, authorize } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleGetBalance,
  handleListLedger,
  handleRequestWithdrawal,
  handleListMyWithdrawals,
  handleCancelMyWithdrawal,
  handleAdminListWithdrawals,
  handleAdminTransitionWithdrawal,
  handleAdminGetArtistBalance,
  requestWithdrawalValidation,
  listLedgerValidation,
  transitionWithdrawalValidation,
} from '../controllers/wallet.controller'

const router = Router()

router.use(requireAuth)
router.use(apiRateLimit)

// ── Self-service (artist views/manages their own wallet) ───────────────────────

router.get('/balance',              handleGetBalance)
router.get('/ledger',               listLedgerValidation, handleListLedger)
router.post('/withdrawals',         requestWithdrawalValidation, handleRequestWithdrawal)
router.get('/withdrawals',          handleListMyWithdrawals)
router.post('/withdrawals/:id/cancel', handleCancelMyWithdrawal)

// ── Admin ──────────────────────────────────────────────────────────────────────

router.get(
  '/admin/withdrawals',
  authorize(['ADMIN']),
  handleAdminListWithdrawals
)

router.patch(
  '/admin/withdrawals/:id',
  authorize(['ADMIN']),
  transitionWithdrawalValidation,
  handleAdminTransitionWithdrawal
)

router.get(
  '/admin/artists/:userId/balance',
  authorize(['ADMIN']),
  handleAdminGetArtistBalance
)

export { router as walletRouter }
