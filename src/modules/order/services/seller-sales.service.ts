import type { PaginatedResult } from '../../../common/types/commerce.types'
import type {
  SellerSaleLine,
  SellerSalesCounts,
  SellerSalesFilters,
} from '@/common/types/seller-sales.types'
import { sellerSalesRepository } from '@/modules/order/repositories/seller-sales.repository'

export const sellerSalesService = {
  list(sellerId: string, filters: SellerSalesFilters): Promise<PaginatedResult<SellerSaleLine>> {
    return sellerSalesRepository.list(sellerId, filters)
  },

  counts(sellerId: string): Promise<SellerSalesCounts> {
    return sellerSalesRepository.counts(sellerId)
  },
}
