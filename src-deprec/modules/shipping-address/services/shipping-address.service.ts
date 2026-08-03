import { shippingAddressRepository } from '../repositories/shipping-address.repository'
import { NotFoundError } from '@/common/errors'
import type {
  ShippingAddress,
  CreateShippingAddressInput,
} from '@/common/types/commerce.types'

export const shippingAddressService = {

  async list(userId: string): Promise<ShippingAddress[]> {
    return shippingAddressRepository.listByUser(userId)
  },

  async get(id: string, userId: string): Promise<ShippingAddress> {
    const address = await shippingAddressRepository.findById(id, userId)
    if (!address) throw new NotFoundError('Shipping address')
    return address
  },

  // ── create ─────────────────────────────────────────────────────────────────
  // A brand-new user's first saved address is always made the default,
  // regardless of what the client sent, so there's never a saved address
  // with nothing marked default. Subsequent inserts asking to be default
  // go through the atomic swap RPC instead of a plain insert, since a
  // plain insert with is_default = true would violate the one-default
  // unique index if a default already exists.

  async create(userId: string, input: CreateShippingAddressInput): Promise<ShippingAddress> {
    const existing = await shippingAddressRepository.listByUser(userId)
    const isFirst  = existing.length === 0

    const created = await shippingAddressRepository.create(userId, {
      ...input,
      is_default: isFirst ? true : false,
    })

    if (!isFirst && input.is_default) {
      const promoted = await shippingAddressRepository.setDefault(created.id, userId)
      return promoted ?? created
    }

    return created
  },

  async update(
    id: string,
    userId: string,
    input: Partial<Omit<CreateShippingAddressInput, 'is_default'>>,
  ): Promise<ShippingAddress> {
    const updated = await shippingAddressRepository.update(id, userId, input)
    if (!updated) throw new NotFoundError('Shipping address')
    return updated
  },

  async setDefault(id: string, userId: string): Promise<ShippingAddress> {
    const updated = await shippingAddressRepository.setDefault(id, userId)
    if (!updated) throw new NotFoundError('Shipping address')
    return updated
  },

  async remove(id: string, userId: string): Promise<void> {
    const deleted = await shippingAddressRepository.delete(id, userId)
    if (!deleted) throw new NotFoundError('Shipping address')
  },
}
