"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const delivery_repository_1 = require("../repositories/delivery.repository");
const order_repository_1 = require("../../../modules/order/repositories/order.repository");
const redis_client_1 = require("../../../modules/redis/redis.client");
const errors_1 = require("../../../common/errors");
const database_1 = require("../../../config/database");
// ── Constants ─────────────────────────────────────────────────────────────────
const TOKEN_EXPIRY_DAYS = 7;
const MAX_DOWNLOADS = 3;
const SIGNED_URL_TTL_SEC = 300;
const RAW_TOKEN_BYTES = 48;
// ── Cloudinary signed URL helper ──────────────────────────────────────────────
// Generates a time-limited signed URL for the digital asset. The raw
// Cloudinary URL is never exposed to the buyer — only this signed variant.
// Signature uses HMAC-SHA1 per Cloudinary's authentication spec.
function buildSignedCloudinaryUrl(cloudinaryUrl, expiresAt) {
    const cloudName = process.env['CLOUDINARY_CLOUD_NAME'] ?? '';
    const apiSecret = process.env['CLOUDINARY_API_SECRET'] ?? '';
    if (!cloudName || !apiSecret)
        return cloudinaryUrl;
    // Extract public_id from URL. Format:
    // https://res.cloudinary.com/{cloud}/image/upload/v{version}/{public_id}.{ext}
    const match = cloudinaryUrl.match(/\/upload\/(?:v\d+\/)?(.+)$/);
    if (!match)
        return cloudinaryUrl;
    const publicId = match[1].replace(/\.[^.]+$/, ''); // strip extension
    const toSign = `timestamp=${expiresAt}&public_id=${publicId}${apiSecret}`;
    const signature = crypto_1.default.createHash('sha1').update(toSign).digest('hex');
    return `https://res.cloudinary.com/${cloudName}/image/upload/s--${signature}--/e_${expiresAt}/${publicId}`;
}
// ── Service ───────────────────────────────────────────────────────────────────
exports.deliveryService = {
    // ── generateTokensForOrder ────────────────────────────────────────────────
    // Called by orderService.fulfillOrder for all DIGITAL items in an order.
    // Generates one token per digital order_item. Idempotent — if a token
    // already exists for an order_item, it is returned as-is.
    async generateTokensForOrder(orderId, buyerId) {
        const order = await order_repository_1.orderRepository.findById(orderId);
        if (!order)
            throw new errors_1.AppError('Order not found', 404, 'ORDER_NOT_FOUND');
        const digitalItems = order.items.filter(i => i.artwork_format === 'DIGITAL');
        if (!digitalItems.length)
            return [];
        const tokens = [];
        for (const item of digitalItems) {
            // Idempotency — don't create duplicate tokens
            const existing = await delivery_repository_1.deliveryRepository.findByOrderItem(item.id);
            if (existing) {
                tokens.push(existing);
                continue;
            }
            const token = await this._issueToken(item, buyerId);
            tokens.push(token);
        }
        return tokens;
    },
    // ── validateAndRedeem ─────────────────────────────────────────────────────
    // Validates the raw token string, enforces all access guards, records
    // the download, and returns a short-lived signed URL for the digital asset.
    // Rate limiting is applied at the route layer (10 req/min per IP).
    async validateAndRedeem(rawToken, requesterId) {
        const tokenHash = crypto_1.default.createHash('sha256').update(rawToken).digest('hex');
        // Cache check — validated tokens are cached briefly to absorb polling
        let tokenRecord = await (0, redis_client_1.redisGetJson)(redis_client_1.RedisKeys.deliveryToken(tokenHash));
        if (!tokenRecord) {
            const found = await delivery_repository_1.deliveryRepository.findByHash(tokenHash);
            if (!found) {
                throw new errors_1.AppError('Invalid or expired download token', 404, 'INVALID_DOWNLOAD_TOKEN');
            }
            tokenRecord = found;
            void (0, redis_client_1.redisSetJson)(redis_client_1.RedisKeys.deliveryToken(tokenHash), tokenRecord, redis_client_1.RedisTTL.deliveryToken);
        }
        if (tokenRecord.buyer_id !== requesterId) {
            throw new errors_1.ForbiddenError();
        }
        if (new Date() > new Date(tokenRecord.expires_at)) {
            void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.deliveryToken(tokenHash));
            throw new errors_1.AppError('This download link has expired', 410, 'DOWNLOAD_TOKEN_EXPIRED');
        }
        if (tokenRecord.download_count >= tokenRecord.max_downloads) {
            throw new errors_1.AppError(`Download limit reached (${tokenRecord.max_downloads} downloads maximum)`, 429, 'DOWNLOAD_LIMIT_REACHED');
        }
        // const { supabase } = await import('../../../config/database')
        const artworkResult = await (0, database_1.supabase)()
            .from('artworks')
            .select('assets, title, slug')
            .eq('id', tokenRecord.artwork_id)
            .single();
        if (artworkResult.error || !artworkResult.data) {
            throw new errors_1.AppError('Artwork asset not found', 404, 'ARTWORK_ASSET_NOT_FOUND');
        }
        const assets = artworkResult.data['assets'] ?? [];
        const primaryAsset = assets.find((a) => a['ordering_index'] === 0) ?? assets[0];
        if (!primaryAsset?.['original_url']) {
            throw new errors_1.AppError('Digital file is not available', 404, 'DIGITAL_FILE_NOT_FOUND');
        }
        await delivery_repository_1.deliveryRepository.recordDownload(tokenRecord.id);
        // Invalidate cache so next request sees the updated download count
        void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.deliveryToken(tokenHash));
        const urlExpiry = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SEC;
        const signedUrl = buildSignedCloudinaryUrl(primaryAsset['original_url'], urlExpiry);
        const filename = `${artworkResult.data['slug']}-artsony.${primaryAsset['mime_type']?.split('/')[1] ?? 'jpg'}`;
        return {
            signed_url: signedUrl,
            filename,
            expires_at: new Date(urlExpiry * 1000),
        };
    },
    // ── getMyDownloads ────────────────────────────────────────────────────────
    // Returns all active download tokens for the authenticated buyer.
    async getMyDownloads(buyerId) {
        return delivery_repository_1.deliveryRepository.findByBuyer(buyerId);
    },
    // ── _issueToken ───────────────────────────────────────────────────────────
    // Internal: generates a cryptographically secure raw token, hashes it
    // with SHA-256 for storage (argon2 is too slow for download-path lookups),
    // persists the hash, and returns the record.
    // The raw token is returned once and never stored — it must be sent to
    // the buyer immediately (e.g. via email or order confirmation payload).
    async _issueToken(item, buyerId) {
        const rawToken = crypto_1.default.randomBytes(RAW_TOKEN_BYTES).toString('hex');
        const tokenHash = crypto_1.default.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + TOKEN_EXPIRY_DAYS);
        const record = await delivery_repository_1.deliveryRepository.create({
            order_item_id: item.id,
            artwork_id: item.artwork_id,
            buyer_id: buyerId,
            token_hash: tokenHash,
            expires_at: expiresAt,
            max_downloads: MAX_DOWNLOADS,
        });
        return { ...record, _raw_token: rawToken };
    },
};
//# sourceMappingURL=delivery.service.js.map