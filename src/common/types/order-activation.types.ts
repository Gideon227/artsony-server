import type { CourierServiceType } from './commerce.types'

export const REQUIRED_PACKAGING_PHOTOS = 3
export const ACTIVATION_SESSION_TTL_MS = 15 * 60 * 1000

// Couriers a seller can pick when activating an order.
export const SELLER_COURIERS = ['Fedex'] as const
export type SellerCourier = (typeof SELLER_COURIERS)[number]

export const SELLER_SERVICE_TYPES = ['STANDARD', 'EXPRESS', 'OVERNIGHT', 'ECONOMY'] as const satisfies readonly CourierServiceType[]

export type ActivationSessionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'SUPERSEDED'

export type ActivationSession = {
  id: string
  order_item_physical_id: string
  seller_id: string
  status: ActivationSessionStatus
  failure_reason: string | null
  expires_at: string
  created_at: string
  completed_at: string | null
}

export type PackagingProofInput = {
  position: number
  cloudinary_public_id: string
  secure_url: string
  mime_type: string
  file_size_bytes: number
  width: number | null
  height: number | null
}

export type ShippingInput = {
  courier_name: SellerCourier
  courier_service_type: CourierServiceType
  pickup_address: string
}

export type ActivationSessionResult =
  | { status: 'COMPLETED' }
  | { status: 'PENDING'; session_id: string; upload_url: string; expires_at: string }

export type ActivationSessionState = {
  session_id: string
  status: ActivationSessionStatus
  failure_reason: string | null
  expires_at: string
}

export type UploadContext = {
  artwork_title: string
  order_code: string
  required_photos: number
  expires_at: string
}
