import { PLATFORM_SERVICE_FEE_RATE, ORDER_CONFIRMATION_WINDOW_MS } from '@/common/types/commerce.types'
import type {
  SellerSaleFile,
  SellerSaleTimelineEvent,
} from '@/common/types/seller-sales.types'

type Row = Record<string, any>

export function computeNetEarning(lineTotal: number): number {
  return Math.round(lineTotal * (1 - PLATFORM_SERVICE_FEE_RATE) * 100) / 100
}

export function confirmationDeadline(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null
  const start = new Date(createdAt).getTime()
  if (!Number.isFinite(start)) return null
  return new Date(start + ORDER_CONFIRMATION_WINDOW_MS).toISOString()
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

export function variantLabel(snapshot: Row | null | undefined): string | null {
  if (!snapshot) return null
  const option = typeof snapshot['option_label'] === 'string' ? snapshot['option_label'].trim() : ''
  if (!option) return null
  const type = typeof snapshot['variant_type'] === 'string' ? snapshot['variant_type'].trim() : ''
  return type ? `${titleCase(type)}: ${option}` : option
}

export function formatPickupAddress(registration: Row | null | undefined): string | null {
  if (!registration) return null
  const parts = [registration['address'], registration['city'], registration['state'], registration['country']]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim())
  return parts.length > 0 ? parts.join(', ') : null
}

export function mapTimelineEvent(row: Row): SellerSaleTimelineEvent {
  return {
    status: String(row['timeline_status']),
    actor_role: String(row['actor_role']),
    notes: typeof row['notes'] === 'string' ? row['notes'] : null,
    occurred_at: String(row['occurred_at']),
  }
}

function fileBaseName(asset: Row, index: number): string {
  const publicId = typeof asset['public_id'] === 'string' ? asset['public_id'] : ''
  const base = publicId.split('/').filter(Boolean).pop()
  return base && base.length > 0 ? base : `Artwork file ${index + 1}`
}

export function mapDigitalFiles(assets: unknown): SellerSaleFile[] {
  if (!Array.isArray(assets)) return []
  return (assets as Row[])
    .slice()
    .sort((a, b) => Number(a['ordering_index'] ?? 0) - Number(b['ordering_index'] ?? 0))
    .map((asset, index) => ({
      id: String(asset['id'] ?? index),
      name: fileBaseName(asset, index),
      mime_type: String(asset['mime_type'] ?? ''),
      media_type: String(asset['media_type'] ?? ''),
      file_size_bytes: Number(asset['file_size_bytes'] ?? 0),
    }))
}

export function cancellationReason(events: Row[]): string | null {
  const event = events.find((candidate) =>
    ['ORDER_FAILED_TO_CONFIRM', 'DELIVERY_FAILED'].includes(String(candidate['timeline_status'])),
  )
  if (!event) return null
  const metadata = (event['metadata'] ?? {}) as Row
  if (typeof metadata['reason'] === 'string' && metadata['reason'].trim()) return metadata['reason'].trim()
  return typeof event['notes'] === 'string' ? event['notes'] : null
}
