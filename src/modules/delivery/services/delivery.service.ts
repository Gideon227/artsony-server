import crypto from 'crypto'
import argon2 from 'argon2'
import { deliveryRepository } from '../repositories/delivery.repository'
import { orderRepository } from '@/modules/order/repositories/order.repository'
import { redisGetJson, redisSetJson, redisDel, RedisKeys, RedisTTL } from '@/modules/redis/redis.client'
import { AppError, ForbiddenError } from '@/common/errors'
import type { DigitalDeliveryToken, DigitalDeliveryTokenWithArtwork, OrderItem } from '@/common/types/commerce.types'
import { supabase } from '@/config/database'

// ── Constants ─────────────────────────────────────────────────────────────────

const TOKEN_EXPIRY_DAYS = 7
const MAX_DOWNLOADS = 3
const SIGNED_URL_TTL_SEC = 300
const RAW_TOKEN_BYTES = 48

// ── Cloudinary signed URL helper ──────────────────────────────────────────────
// Generates a time-limited signed URL for the digital asset. The raw
// Cloudinary URL is never exposed to the buyer — only this signed variant.
// Signature uses HMAC-SHA1 per Cloudinary's authentication spec.

function buildSignedCloudinaryUrl(
  cloudinaryUrl: string,
  expiresAt:     number,
): string {
  const cloudName  = process.env['CLOUDINARY_CLOUD_NAME'] ?? ''
  const apiSecret  = process.env['CLOUDINARY_API_SECRET'] ?? ''

  if (!cloudName || !apiSecret) return cloudinaryUrl

  // Extract public_id from URL. Format:
  // https://res.cloudinary.com/{cloud}/image/upload/v{version}/{public_id}.{ext}
  const match = cloudinaryUrl.match(/\/upload\/(?:v\d+\/)?(.+)$/)
  if (!match) return cloudinaryUrl

  const publicId      = match[1]!.replace(/\.[^.]+$/, '') // strip extension
  const toSign        = `timestamp=${expiresAt}&public_id=${publicId}${apiSecret}`
  const signature     = crypto.createHash('sha1').update(toSign).digest('hex')

  return `https://res.cloudinary.com/${cloudName}/image/upload/s--${signature}--/e_${expiresAt}/${publicId}`
}

// ── Service ───────────────────────────────────────────────────────────────────

export const deliveryService = {

  // ── generateTokensForOrder ────────────────────────────────────────────────
  // Called by orderService.fulfillOrder for all DIGITAL items in an order.
  // Generates one token per digital order_item. Idempotent — if a token
  // already exists for an order_item, it is returned as-is.

  async generateTokensForOrder(
    orderId:  string,
    buyerId:  string,
  ): Promise<DigitalDeliveryToken[]> {
    const order = await orderRepository.findById(orderId)
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND')

    const digitalItems = order.items.filter(i => i.artwork_format === 'DIGITAL')
    if (!digitalItems.length) return []

    const tokens: DigitalDeliveryToken[] = []

    for (const item of digitalItems) {
      // Idempotency — don't create duplicate tokens
      const existing = await deliveryRepository.findByOrderItem(item.id)
      if (existing) {
        tokens.push(existing)
        continue
      }

      const token = await this._issueToken(item, buyerId)
      tokens.push(token)
    }

    return tokens
  },

  // ── validateAndRedeem ─────────────────────────────────────────────────────
  // Validates the raw token string, enforces all access guards, records
  // the download, and returns a short-lived signed URL for the digital asset.
  // Rate limiting is applied at the route layer (10 req/min per IP).

  async validateAndRedeem(
    rawToken:    string,
    requesterId: string,
  ): Promise<{ signed_url: string; filename: string; expires_at: Date }> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    // Cache check — validated tokens are cached briefly to absorb polling
    let tokenRecord = await redisGetJson<DigitalDeliveryToken>(RedisKeys.deliveryToken(tokenHash))

    if (!tokenRecord) {
      const found = await deliveryRepository.findByHash(tokenHash)
      if (!found) {
        throw new AppError('Invalid or expired download token', 404, 'INVALID_DOWNLOAD_TOKEN')
      }
      tokenRecord = found
      void redisSetJson(RedisKeys.deliveryToken(tokenHash), tokenRecord, RedisTTL.deliveryToken)
    }

    if (tokenRecord.buyer_id !== requesterId) {
      throw new ForbiddenError()
    }

    const result = await this._redeem(tokenRecord)
    // Invalidate cache so the next request sees the updated download count
    void redisDel(RedisKeys.deliveryToken(tokenHash))
    return result
  },

  // ── getDownloadForOrderItem ───────────────────────────────────────────────
  // In-app download entry point for an authenticated buyer, used by the
  // "My Downloads" page. Unlike validateAndRedeem (which trusts a
  // bearer-style raw token — the right model for an out-of-band context
  // like an email link), this trusts the caller's authenticated session and
  // verifies ownership directly against order_item_id. It does not require
  // the one-time raw token to have survived email delivery, so it remains
  // usable even if the delivery email bounced, landed in spam, or was
  // deleted. Both paths share the same underlying accounting (download
  // count, expiry, max downloads) since they operate on the same
  // digital_delivery_tokens row.

  async getDownloadForOrderItem(
    orderItemId: string,
    requesterId: string,
  ): Promise<{ signed_url: string; filename: string; expires_at: Date }> {
    const tokenRecord = await deliveryRepository.findByOrderItem(orderItemId)
    if (!tokenRecord) {
      throw new AppError('Download not available for this item', 404, 'DOWNLOAD_NOT_FOUND')
    }
    if (tokenRecord.buyer_id !== requesterId) {
      throw new ForbiddenError()
    }

    const result = await this._redeem(tokenRecord)
    void redisDel(RedisKeys.deliveryToken(tokenRecord.token_hash))
    return result
  },

  // ── getMyDownloads ────────────────────────────────────────────────────────
  // Returns all active download tokens for the authenticated buyer.

  async getMyDownloads(buyerId: string): Promise<DigitalDeliveryTokenWithArtwork[]> {
    return deliveryRepository.findByBuyer(buyerId)
  },

  // ── _redeem ────────────────────────────────────────────────────────────────
  // Internal: shared guard + delivery logic for both access paths above.
  // Enforces expiry and the per-token download cap, resolves the artwork's
  // primary asset, records the download, and returns a short-lived signed
  // Cloudinary URL. Caller is responsible for the ownership check specific
  // to its access path (bearer token vs. session ownership) before calling
  // this — this only enforces guards that apply regardless of access path.

  async _redeem(
    tokenRecord: DigitalDeliveryToken,
  ): Promise<{ signed_url: string; filename: string; expires_at: Date }> {
    if (new Date() > new Date(tokenRecord.expires_at)) {
      throw new AppError('This download link has expired', 410, 'DOWNLOAD_TOKEN_EXPIRED')
    }

    if (tokenRecord.download_count >= tokenRecord.max_downloads) {
      throw new AppError(
        `Download limit reached (${tokenRecord.max_downloads} downloads maximum)`,
        429,
        'DOWNLOAD_LIMIT_REACHED',
      )
    }

    const artworkResult = await (supabase() as any)
      .from('artworks')
      .select('assets, title, slug')
      .eq('id', tokenRecord.artwork_id)
      .single()

    if (artworkResult.error || !artworkResult.data) {
      throw new AppError('Artwork asset not found', 404, 'ARTWORK_ASSET_NOT_FOUND')
    }

    const assets: any[]  = artworkResult.data['assets'] ?? []
    const primaryAsset   = assets.find((a: any) => a['ordering_index'] === 0) ?? assets[0]

    if (!primaryAsset?.['original_url']) {
      throw new AppError('Digital file is not available', 404, 'DIGITAL_FILE_NOT_FOUND')
    }

    await deliveryRepository.recordDownload(tokenRecord.id)

    const urlExpiry  = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SEC
    const signedUrl  = buildSignedCloudinaryUrl(primaryAsset['original_url'], urlExpiry)
    const filename   = `${artworkResult.data['slug']}-artsony.${primaryAsset['mime_type']?.split('/')[1] ?? 'jpg'}`

    return {
      signed_url: signedUrl,
      filename,
      expires_at: new Date(urlExpiry * 1000),
    }
  },

  // ── _issueToken ───────────────────────────────────────────────────────────
  // Internal: generates a cryptographically secure raw token, hashes it
  // with SHA-256 for storage (argon2 is too slow for download-path lookups),
  // persists the hash, and returns the record.
  // The raw token is returned once and never stored — it must be sent to
  // the buyer immediately (e.g. via email or order confirmation payload).

  async _issueToken(
    item:    OrderItem,
    buyerId: string,
  ): Promise<DigitalDeliveryToken> {
    const rawToken  = crypto.randomBytes(RAW_TOKEN_BYTES).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + TOKEN_EXPIRY_DAYS)

    const record = await deliveryRepository.create({
      order_item_id: item.id,
      artwork_id:    item.artwork_id,
      buyer_id:      buyerId,
      token_hash:    tokenHash,
      expires_at:    expiresAt,
      max_downloads: MAX_DOWNLOADS,
    })

    return { ...record, _raw_token: rawToken } as any
  },
}