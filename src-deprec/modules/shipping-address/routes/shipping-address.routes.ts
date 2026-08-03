import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
import {
  handleList,
  handleGet,
  handleCreate,
  handleUpdate,
  handleSetDefault,
  handleDelete,
  createShippingAddressValidation,
  updateShippingAddressValidation,
  shippingAddressIdValidation,
} from '../controllers/shipping-address.controller'

const router = Router()

// A saved address is always user-scoped.
router.use(requireAuth)

router.get('/', handleList)

router.post('/', createShippingAddressValidation, handleCreate)

router.get('/:id', shippingAddressIdValidation, handleGet)

router.patch('/:id', updateShippingAddressValidation, handleUpdate)

router.post('/:id/default', shippingAddressIdValidation, handleSetDefault)

router.delete('/:id', shippingAddressIdValidation, handleDelete)

export { router as shippingAddressRouter }
