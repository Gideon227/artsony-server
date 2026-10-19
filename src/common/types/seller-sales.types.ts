export const SELLER_STATUSES = ['LIVE', 'PENDING', 'COMPLETED', 'CANCELLED'] as const
export type SellerStatus = (typeof SELLER_STATUSES)[number]

export const SELLER_SALES_FORMATS = ['PHYSICAL', 'DIGITAL'] as const
export type SellerSalesFormat = (typeof SELLER_SALES_FORMATS)[number]

export const SELLER_SALES_SORT_FIELDS = ['date', 'value'] as const
export type SellerSalesSortField = (typeof SELLER_SALES_SORT_FIELDS)[number]

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
  buyer_id: string
  buyer_name: string
  buyer_avatar_url: string | null
  seller_status: SellerStatus
  timeline_status: string | null
  delivery_status: string | null
  purchased_at: string
  courier_name: string | null
  estimated_delivery_date: string | null
  delivered_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  refund_status: string | null
  refund_amount: number | null
}

export type SellerSalesFilters = {
  status?: SellerStatus
  format?: SellerSalesFormat
  price_min?: number
  price_max?: number
  date_from?: string
  date_to?: string
  q?: string
  sort_by?: SellerSalesSortField
  sort_order?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export type SellerSalesCounts = Record<SellerStatus, number> & { ALL: number }

export type SellerSaleTimelineEvent = {
  status: string
  actor_role: string
  notes: string | null
  occurred_at: string
}

export type SellerSaleProof = {
  id: string
  url: string
  uploaded_at: string
}

export type SellerSaleFile = {
  id: string
  name: string
  mime_type: string
  media_type: string
  file_size_bytes: number
}

export type SellerSaleCancellation = {
  cancelled_by: string | null
  reason: string | null
  cancelled_at: string | null
  refund_status: string | null
  refund_amount: number | null
}

export type SellerSaleDetail = SellerSaleLine & {
  net_earning: number
  variant_label: string | null
  license_type: string | null
  dimensions: { length: number; width: number; height: number; unit: 'cm' | 'in' } | null
  tracking_id: string | null
  courier_service_type: string | null
  pickup_address: string | null
  pickup_address_saved: boolean
  delivery_location: { city: string | null; state: string | null; country_code: string | null } | null
  picked_up_at: string | null
  last_updated_at: string | null
  confirmation_deadline: string | null
  latest_event: SellerSaleTimelineEvent | null
  timeline: SellerSaleTimelineEvent[]
  delivery_proofs: SellerSaleProof[]
  packaging_proofs: SellerSaleProof[]
  label_available: boolean
  files: SellerSaleFile[]
  total_file_size_bytes: number | null
  cancellation: SellerSaleCancellation | null
}
