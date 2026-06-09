import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleGetCart,
  handleAddItem,
  handleUpdateItem,
  handleRemoveItem,
  handleClearCart,
  addItemValidation,
  updateItemValidation,
  removeItemValidation,
} from '../controllers/cart.controller'

const router = Router()

// All cart routes require authentication — a cart is always user-scoped.
// The apiRateLimit (100 req/min per user) is inherited from app-level
// middleware. No additional per-route limiter is needed here.
router.use(requireAuth)

router.get('/', handleGetCart)

router.post('/items', addItemValidation, handleAddItem)

router.patch('/items/:id', updateItemValidation, handleUpdateItem)

router.delete('/items/:id', removeItemValidation, handleRemoveItem)

router.delete('/', handleClearCart)

export { router as cartRouter }