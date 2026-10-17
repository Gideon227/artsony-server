import { supabase, assertNoError } from '@/config/database'
import type { DigitalDeliveryToken, DigitalDeliveryTokenWithArtwork } from '@/common/types/commerce.types'

function toToken(row: any): DigitalDeliveryToken {
  return {
    id: row['id'],
    order_item_id: row['order_item_id'],
    artwork_id: row['artwork_id'],
    buyer_id: row['buyer_id'],
    token_hash: row['token_hash'],
    expires_at: row['expires_at'] ? new Date(row['expires_at']) : null,
    download_count: row['download_count'],
    max_downloads: row['max_downloads'],
    last_downloaded_at: row['last_downloaded_at'] ? new Date(row['last_downloaded_at']) : null,
    created_at: new Date(row['created_at']),
  }
}

function toTokenWithArtwork(row: any): DigitalDeliveryTokenWithArtwork {
  const artwork = (row['artworks'] ?? {}) as Record<string, unknown>
  const assets  = (artwork['assets'] as any[] | undefined) ?? []
  const primaryAsset = assets.find((a) => a?.['ordering_index'] === 0) ?? assets[0]

  return {
    ...toToken(row),
    artwork_title: (artwork['title'] as string | undefined) ?? 'Untitled artwork',
    artwork_slug: (artwork['slug'] as string | undefined) ?? '',
    artwork_thumbnail_url:  (primaryAsset?.['thumbnail_url'] as string | undefined)
      ?? (primaryAsset?.['original_url'] as string | undefined)
      ?? null,
  }
}

export const deliveryRepository = {

  async create(input: {
    order_item_id: string
    artwork_id: string
    buyer_id: string
    token_hash: string
    max_downloads: number
  }): Promise<DigitalDeliveryToken> {
    const result = await (supabase() as any)
      .from('digital_delivery_tokens')
      .insert({
        order_item_id: input.order_item_id,
        artwork_id: input.artwork_id,
        buyer_id: input.buyer_id,
        token_hash: input.token_hash,
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

  async findByBuyer(buyerId: string): Promise<DigitalDeliveryTokenWithArtwork[]> {
    const result = await (supabase() as any)
      .from('digital_delivery_tokens')
      .select('*, artworks!artwork_id ( title, slug, assets )')
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false })

    assertNoError(result, 'delivery.findByBuyer')
    return (result.data ?? []).map(toTokenWithArtwork)
  },

  // Claims a download slot with a compare-and-swap on download_count, so two
  // concurrent requests can never both consume the same slot. Returns null when
  // the token is exhausted or another request claimed the slot first.
  async claimDownload(tokenId: string): Promise<DigitalDeliveryToken | null> {
    const current = await (supabase() as any)
      .from('digital_delivery_tokens')
      .select('download_count, max_downloads')
      .eq('id', tokenId)
      .single()

    assertNoError(current, 'delivery.claimDownload.fetch')

    const count = current.data['download_count'] as number
    if (count >= (current.data['max_downloads'] as number)) return null

    const result = await (supabase() as any)
      .from('digital_delivery_tokens')
      .update({
        download_count:     count + 1,
        last_downloaded_at: new Date().toISOString(),
      })
      .eq('id', tokenId)
      .eq('download_count', count)
      .select('*')
      .maybeSingle()

    if (result.error) {
      throw new Error(`[delivery.claimDownload] ${result.error.message}`)
    }
    return result.data ? toToken(result.data) : null
  },
}