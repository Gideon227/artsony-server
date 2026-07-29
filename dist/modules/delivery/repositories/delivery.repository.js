"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryRepository = void 0;
const database_1 = require("../../../config/database");
function toToken(row) {
    return {
        id: row['id'],
        order_item_id: row['order_item_id'],
        artwork_id: row['artwork_id'],
        buyer_id: row['buyer_id'],
        token_hash: row['token_hash'],
        expires_at: new Date(row['expires_at']),
        download_count: row['download_count'],
        max_downloads: row['max_downloads'],
        last_downloaded_at: row['last_downloaded_at'] ? new Date(row['last_downloaded_at']) : null,
        created_at: new Date(row['created_at']),
    };
}
exports.deliveryRepository = {
    async create(input) {
        const result = await (0, database_1.supabase)()
            .from('digital_delivery_tokens')
            .insert({
            order_item_id: input.order_item_id,
            artwork_id: input.artwork_id,
            buyer_id: input.buyer_id,
            token_hash: input.token_hash,
            expires_at: input.expires_at.toISOString(),
            max_downloads: input.max_downloads,
        })
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'delivery.create');
        return toToken(result.data);
    },
    // Lookup by hash — O(1) via the idx_digital_delivery_token_hash index.
    async findByHash(tokenHash) {
        const result = await (0, database_1.supabase)()
            .from('digital_delivery_tokens')
            .select('*')
            .eq('token_hash', tokenHash)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'delivery.findByHash');
        return toToken(result.data);
    },
    async findByOrderItem(orderItemId) {
        const result = await (0, database_1.supabase)()
            .from('digital_delivery_tokens')
            .select('*')
            .eq('order_item_id', orderItemId)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'delivery.findByOrderItem');
        return toToken(result.data);
    },
    async findByBuyer(buyerId) {
        const result = await (0, database_1.supabase)()
            .from('digital_delivery_tokens')
            .select('*')
            .eq('buyer_id', buyerId)
            .order('created_at', { ascending: false });
        if (result.error)
            return [];
        return (result.data ?? []).map(toToken);
    },
    // Atomically increments download_count and updates last_downloaded_at.
    // Returns the updated token.
    async recordDownload(tokenId) {
        // Fetch first so we can compute the new count — Supabase JS client
        // doesn't support arithmetic updates natively.
        const current = await (0, database_1.supabase)()
            .from('digital_delivery_tokens')
            .select('download_count')
            .eq('id', tokenId)
            .single();
        (0, database_1.assertNoError)(current, 'delivery.recordDownload.fetch');
        const result = await (0, database_1.supabase)()
            .from('digital_delivery_tokens')
            .update({
            download_count: current.data['download_count'] + 1,
            last_downloaded_at: new Date().toISOString(),
        })
            .eq('id', tokenId)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'delivery.recordDownload');
        return toToken(result.data);
    },
};
//# sourceMappingURL=delivery.repository.js.map