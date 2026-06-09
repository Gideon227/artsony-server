import { supabase, assertNoError } from '@/config/database'
import type { DigitalDeliveryToken } from '@/common/types/commerce.types'

function toToken(row: any): DigitalDeliveryToken {
  return {
    id:                 row['id'],
    order_item_id:      row['order_item_id'],
    artwork_id:         row['artwork_id'],
    buyer_id:           row['buyer_id'],
    token_hash:         row['token_hash'],
    expires_at:         new Date(row['expires_at']),
    download_count:     row['download_count'],
    max_downloads:      row['max_downloads'],
    last_downloaded_at: row['last_downloaded_at'] ? new Date(row['last_downloaded_at']) : null,
    created_at:         new Date(row['created_at']),
  }
}

export const deliveryRepository = {

  async create(input: {
    order_item_id: string
    artwork_id:    string
    buyer_id:      string
    token_hash:    string
    expires_at:    Date
    max_downloads: number
  }): Promise<DigitalDeliveryToken> {
    const result = await (supabase() as any)
      .from('digital_delivery_tokens')
      .insert({
        order_item_id: input.order_item_id,
        artwork_id:    input.artwork_id,
        buyer_id:      input.buyer_id,
        token_hash:    input.token_hash,
        expires_at:    input.expires_at.toISOString(),
        max_downloads: input.max_downloads,
      })
      .select('*')
      .single()

    assertNoError(result, 'delivery.create')
    return toToken(result.data)
  },

  // Lookup by hash — O(1) via the idx_digital_delivery_token_hash index.
  async findByHash(tokenHash: string): Promise<DigitalDeliveryToken | undefined> {
    const result = await (supabase() as any)
      .from('digital_delivery_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'delivery.findByHash')
    return toToken(result.data)
  },

  async findByOrderItem(orderItemId: string): Promise<DigitalDeliveryToken | undefined> {
    const result = await (supabase() as any)
      .from('digital_delivery_tokens')
      .select('*')
      .eq('order_item_id', orderItemId)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'delivery.findByOrderItem')
    return toToken(result.data)
  },

  async findByBuyer(buyerId: string): Promise<DigitalDeliveryToken[]> {
    const result = await (supabase() as any)
      .from('digital_delivery_tokens')
      .select('*')
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false })

    if (result.error) return []
    return (result.data ?? []).map(toToken)
  },

  // Atomically increments download_count and updates last_downloaded_at.
  // Returns the updated token.
  async recordDownload(tokenId: string): Promise<DigitalDeliveryToken> {
    // Fetch first so we can compute the new count — Supabase JS client
    // doesn't support arithmetic updates natively.
    const current = await (supabase() as any)
      .from('digital_delivery_tokens')
      .select('download_count')
      .eq('id', tokenId)
      .single()

    assertNoError(current, 'delivery.recordDownload.fetch')

    const result = await (supabase() as any)
      .from('digital_delivery_tokens')
      .update({
        download_count:     (current.data['download_count'] as number) + 1,
        last_downloaded_at: new Date().toISOString(),
      })
      .eq('id', tokenId)
      .select('*')
      .single()

    assertNoError(result, 'delivery.recordDownload')
    return toToken(result.data)
  },
}