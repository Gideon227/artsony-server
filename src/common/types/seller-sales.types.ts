export const SELLER_STATUSES = ['LIVE', 'PENDING', 'COMPLETED', 'CANCELLED'] as const
export type SellerStatus = (typeof SELLER_STATUSES)[number]

export const SELLER_SALES_FORMATS = ['PHYSICAL', 'DIGITAL'] as const
export type SellerSalesFormat = (typeof SELLER_SALES_FORMATS)[number]

export type SellerSaleLine = {
  order_item_id: string
  order_id: string
  physical_id: string | null
  order_code: string
  legacy_code: string
  artwork_id: string
  artwork_title: string
  artwork_thumbnail_url: string | null
  artwork_format: SellerSalesFormat
  quantity: number
  unit_price: number
  line_total: number
  currency: string
  buyer_name: string
  seller_status: SellerStatus
  timeline_status: string | null
  delivery_status: string | null
  purchased_at: string
}

export type SellerSalesFilters = {
  status?: SellerStatus
  format?: SellerSalesFormat
  price_min?: number
  price_max?: number
  date_from?: string
  date_to?: string
  q?: string
  sort_order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export type SellerSalesCounts = Record<SellerStatus, number> & { ALL: number }
