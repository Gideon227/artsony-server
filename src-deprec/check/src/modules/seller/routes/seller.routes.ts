import { Router } from 'express'
import { requireAuth, authorize } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleSubmitRegistration,
  handleGetMyRegistration,
  handleUpdateMyRegistration,
  handleAdminList,
  handleAdminGetById,
  handleApprove,
  handleReject,
  handleSuspend,
  handleReactivate,
  submitRegistrationValidation,
  updateRegistrationValidation,
  idParamValidation,
  reviewNotesValidation,
  listFiltersValidation,
} from '../controllers/seller.controller'

const router = Router()

// All seller-registration routes require a valid access token
router.use(requireAuth)
router.use(apiRateLimit)

// ── Self-service routes ─────────────────────────────────────────────────────
// Registered before any admin/:id routes below — /me is a literal segment,
// but keeping this ordering explicit matches the convention already used in
// physical-order.routes.ts (literal paths before param routes).

// POST /api/seller-registrations
//      Submit a new registration, or resubmit (edit) a REJECTED one back to PENDING
router.post('/', submitRegistrationValidation, handleSubmitRegistration)

// GET  /api/seller-registrations/me
//      View my own registration
router.get('/me', handleGetMyRegistration)

// PATCH /api/seller-registrations/me
//      Edit my own registration while it is still PENDING
router.patch('/me', updateRegistrationValidation, handleUpdateMyRegistration)

// ── Admin routes ─────────────────────────────────────────────────────────────

// GET  /api/seller-registrations/admin
//      Paginated, filterable list of all registrations
router.get('/admin', authorize(['ADMIN']), listFiltersValidation, handleAdminList)

// GET  /api/seller-registrations/admin/:id
router.get('/admin/:id', authorize(['ADMIN']), idParamValidation, handleAdminGetById)

// POST /api/seller-registrations/admin/:id/approve
//      PENDING -> APPROVED (initial review)
router.post('/admin/:id/approve', authorize(['ADMIN']), reviewNotesValidation, handleApprove)

// POST /api/seller-registrations/admin/:id/reject
//      PENDING -> REJECTED, or SUSPENDED -> REJECTED (permanent removal)
router.post('/admin/:id/reject', authorize(['ADMIN']), reviewNotesValidation, handleReject)

// POST /api/seller-registrations/admin/:id/suspend
//      APPROVED -> SUSPENDED — revokes marketplace privileges immediately and
//      pauses the seller's published MARKETPLACE artworks
router.post('/admin/:id/suspend', authorize(['ADMIN']), reviewNotesValidation, handleSuspend)

// POST /api/seller-registrations/admin/:id/reactivate
//      SUSPENDED -> APPROVED — restores marketplace privileges and republishes
//      the seller's paused MARKETPLACE artworks
router.post('/admin/:id/reactivate', authorize(['ADMIN']), reviewNotesValidation, handleReactivate)

export { router as sellerRouter }
