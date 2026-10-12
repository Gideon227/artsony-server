export const NOTIFICATION_EVENTS = [
  'order_received',
  'order_confirmed',
  'shipment_activated',
  'pickup_scheduled',
  'order_in_transit',
  'order_delivered',
  'delivery_issue',
  'refund',
  'buyer_refund',
  'funds_available',
  'withdrawal_requested',
  'withdrawal_completed',
  'withdrawal_failed',
  'artwork_approved',
  'artwork_rejected',
  'artwork_sold_out',
  'artwork_removed',
  'login_alert',
  'password_updated',
  'policy_update',
] as const

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]

export type NotificationAudience = 'buyer' | 'seller' | 'admin'

export type NotificationArtworkSnapshot = {
  id: string
  slug: string
  title: string
  thumbnail_url: string | null
}