import { supabase } from '@/config/database'
import type { SellerSaleDetail } from '@/common/types/seller-sales.types'
import { COLUMNS, VIEW, toLine } from './seller-sales.repository'
import {
  cancellationReason,
  computeNetEarning,
  confirmationDeadline,
  formatPickupAddress,
  mapDigitalFiles,
  mapTimelineEvent,
  variantLabel,
} from '../utils/seller-sale-detail'

type Row = Record<string, any>

const PHYSICAL_COLUMNS = [
  'courier_service_type', 'tracking_id', 'pickup_address', 'picked_up_at', 'created_at', 'updated_at',
].join(',')

function db(): any {
  return supabase() as any
}

async function single<T extends Row>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>, label: string): Promise<T | null> {
  const { data, error } = await query
  if (error) throw new Error(`[sellerSaleDetail:${label}] ${error.message}`)
  return data
}

async function many<T extends Row>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>, label: string): Promise<T[]> {
  const { data, error } = await query
  if (error) throw new Error(`[sellerSaleDetail:${label}] ${error.message}`)
  return data ?? []
}

export const sellerSaleDetailRepository = {
  async get(sellerId: string, orderItemId: string): Promise<SellerSaleDetail | null> {
    const lineRow = await single<Row>(
      db().from(VIEW).select(COLUMNS).eq('seller_id', sellerId).eq('order_item_id', orderItemId).maybeSingle(),
      'line',
    )
    if (!lineRow) return null

    const line = toLine(lineRow)
    const physicalId = line.physical_id

    const [item, order, artwork, registration, physical, events, proofs, packagingProofs] = await Promise.all([
      single<Row>(db().from('order_items').select('variant_snapshot').eq('id', orderItemId).maybeSingle(), 'item'),
      single<Row>(db().from('orders').select('shipping_address').eq('id', line.order_id).maybeSingle(), 'order'),
      single<Row>(
        db().from('artworks').select('physical_details, license_type, assets').eq('id', line.artwork_id).maybeSingle(),
        'artwork',
      ),
      single<Row>(
        db().from('seller_registrations').select('address, city, state, country').eq('user_id', sellerId).eq('status', 'APPROVED').maybeSingle(),
        'registration',
      ),
      physicalId
        ? single<Row>(db().from('order_item_physical').select(PHYSICAL_COLUMNS).eq('id', physicalId).maybeSingle(), 'physical')
        : Promise.resolve(null),
      physicalId
        ? many<Row>(
            db()
              .from('order_timeline_events')
              .select('timeline_status, actor_role, notes, metadata, occurred_at')
              .eq('order_item_physical_id', physicalId)
              .order('occurred_at', { ascending: false })
              .limit(25),
            'timeline',
          )
        : Promise.resolve([] as Row[]),
      physicalId
        ? many<Row>(
            db()
              .from('order_delivery_proofs')
              .select('id, secure_url, uploaded_at')
              .eq('order_item_physical_id', physicalId)
              .order('uploaded_at', { ascending: true }),
            'proofs',
          )
        : Promise.resolve([] as Row[]),
      physicalId
        ? many<Row>(
            db()
              .from('order_packaging_proofs')
              .select('id, secure_url, uploaded_at')
              .eq('order_item_physical_id', physicalId)
              .order('position', { ascending: true }),
            'packagingProofs',
          )
        : Promise.resolve([] as Row[]),
    ])

    const isPhysical = line.artwork_format === 'PHYSICAL'
    const physicalDetails = (artwork?.['physical_details'] ?? null) as Row | null
    const shipping = (order?.['shipping_address'] ?? null) as Row | null
    const files = isPhysical ? [] : mapDigitalFiles(artwork?.['assets'])
    const timeline = events.map(mapTimelineEvent)
    const isCancelled = line.seller_status === 'CANCELLED'

    return {
      ...line,
      net_earning: computeNetEarning(line.line_total),
      variant_label: variantLabel(item?.['variant_snapshot']),
      license_type: typeof artwork?.['license_type'] === 'string' ? artwork['license_type'] : null,
      dimensions:
        isPhysical && physicalDetails
          ? {
              length: Number(physicalDetails['length']),
              width: Number(physicalDetails['width']),
              height: Number(physicalDetails['height']),
              unit: physicalDetails['unit'] === 'in' ? 'in' : 'cm',
            }
          : null,
      tracking_id: physical?.['tracking_id'] ?? null,
      courier_service_type: physical?.['courier_service_type'] ?? null,
      pickup_address: isPhysical ? (physical?.['pickup_address'] ?? formatPickupAddress(registration)) : null,
      pickup_address_saved: isPhysical && Boolean(physical?.['pickup_address']),
      delivery_location:
        isPhysical && shipping
          ? {
              city: shipping['city'] ?? null,
              state: shipping['state'] ?? null,
              country_code: shipping['country_code'] ?? null,
            }
          : null,
      picked_up_at: physical?.['picked_up_at'] ?? null,
      last_updated_at: physical?.['updated_at'] ?? null,
      confirmation_deadline: line.seller_status === 'PENDING' ? confirmationDeadline(physical?.['created_at']) : null,
      latest_event: timeline[0] ?? null,
      timeline,
      delivery_proofs: proofs.map((proof) => ({
        id: String(proof['id']),
        url: String(proof['secure_url']),
        uploaded_at: String(proof['uploaded_at']),
      })),
      packaging_proofs: packagingProofs.map((proof) => ({
        id: String(proof['id']),
        url: String(proof['secure_url']),
        uploaded_at: String(proof['uploaded_at']),
      })),
      label_available:
        isPhysical && Boolean(physical?.['tracking_id']) && ['LIVE', 'COMPLETED'].includes(line.seller_status),
      files,
      total_file_size_bytes: files.length > 0 ? files.reduce((sum, file) => sum + file.file_size_bytes, 0) : null,
      cancellation: isCancelled
        ? {
            cancelled_by: line.cancelled_by,
            reason: cancellationReason(events),
            cancelled_at: line.cancelled_at,
            refund_status: line.refund_status,
            refund_amount: line.refund_amount,
          }
        : null,
    }
  },
}
