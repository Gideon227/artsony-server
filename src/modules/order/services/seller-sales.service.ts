import type { PaginatedResult } from '@/common/types/commerce.types'
import type {
  SellerSaleDetail,
  SellerSaleLine,
  SellerSalesCounts,
  SellerSalesFilters,
} from '@/common/types/seller-sales.types'
import { sellerSalesRepository } from '../repositories/seller-sales.repository'
import { sellerSaleDetailRepository } from '../repositories/seller-sale-detail.repository'
import { NotFoundError } from '@/common/errors'

export const sellerSalesService = {
  list(sellerId: string, filters: SellerSalesFilters): Promise<PaginatedResult<SellerSaleLine>> {
    return sellerSalesRepository.list(sellerId, filters)
  },

  counts(sellerId: string): Promise<SellerSalesCounts> {
    return sellerSalesRepository.counts(sellerId)
  },

  async detail(sellerId: string, orderItemId: string): Promise<SellerSaleDetail> {
    const detail = await sellerSaleDetailRepository.get(sellerId, orderItemId)
    if (!detail) throw new NotFoundError('Order')
    return detail
  },
}
