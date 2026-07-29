"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = void 0;
const database_1 = require("../../../config/database");
const connection_manager_1 = require("../../../modules/ws/connection-manager");
const redis_client_1 = require("../../../modules/redis/redis.client");
// ─── NotificationService ──────────────────────────────────────────────────────
// Owns all notification creation and delivery.
// Extends the existing notifications table (001_initial_schema.sql) with the
// new message/broadcast/mention types added by the messaging migration.
exports.notificationService = {
    // ── Create notifications for a received message ───────────────────────────
    // Called by broadcastService for offline participants only.
    // Online participants receive the WS event directly — no notification row.
    async createMessageNotifications(input) {
        if (input.recipientIds.length === 0)
            return;
        const type = input.message.is_broadcast_root ? 'broadcast' : 'message';
        const rows = input.recipientIds.map((recipientId) => ({
            recipient_id: recipientId,
            actor_id: input.message.sender_id,
            type,
            entity_id: input.message.id,
            entity_type: 'message',
            data: {
                conversation_id: input.message.conversation_id,
                preview: buildPreview(input.message.body),
                sender_email: input.message.sender.email,
            },
            is_read: false,
        }));
        // Batch insert — single round-trip for all recipients
        const { error } = await (0, database_1.supabase)()
            .from('notifications')
            .insert(rows);
        if (error) {
            console.error('[NotificationService] Batch insert failed:', error.message);
            return;
        }
        // Increment unread badge count in Redis for each recipient
        // and deliver a WS notification:new event to any instance where
        // the recipient might have connected in the meantime.
        await Promise.allSettled(input.recipientIds.map(async (recipientId) => {
            await (0, redis_client_1.getRedis)().incr(`artsony:notif:${recipientId}:unread`);
            const wsPayload = {
                id: '', // not critical for real-time display
                type,
                entity_id: input.message.id,
                entity_type: 'message',
                actor: {
                    id: input.message.sender_id,
                    email: input.message.sender.email,
                    display_name: input.message.sender.display_name,
                    avatar_url: input.message.sender.avatar_url,
                },
                data: {
                    conversation_id: input.message.conversation_id,
                    preview: buildPreview(input.message.body),
                },
                created_at: new Date().toISOString(),
            };
            await connection_manager_1.connectionManager.deliverToUserGlobal(recipientId, {
                event: 'notification:new',
                notification: wsPayload,
            });
        }));
    },
    // ── Create a single notification for any social event ────────────────────
    // Used by other services (like/comment/follow — out of scope for this
    // feature but leaving the hook here so the pattern is established).
    async create(input) {
        const { error, data } = await (0, database_1.supabase)()
            .from('notifications')
            .insert({
            recipient_id: input.recipientId,
            actor_id: input.actorId,
            type: input.type,
            entity_id: input.entityId,
            entity_type: input.entityType,
            data: input.data ?? {},
            is_read: false,
        })
            .select('id')
            .single();
        if (error) {
            console.error('[NotificationService] create failed:', error.message);
            return;
        }
        // Increment Redis badge
        await (0, redis_client_1.getRedis)().incr(`artsony:notif:${input.recipientId}:unread`);
        // Deliver via WS
        const wsPayload = {
            id: data.id,
            type: input.type,
            entity_id: input.entityId,
            entity_type: input.entityType,
            actor: null,
            data: input.data ?? {},
            created_at: new Date().toISOString(),
        };
        await connection_manager_1.connectionManager.deliverToUserGlobal(input.recipientId, {
            event: 'notification:new',
            notification: wsPayload,
        });
    },
    // ── List notifications for a user (paginated) ─────────────────────────────
    async list(input) {
        const limit = Math.min(input.limit ?? 20, 50);
        let query = (0, database_1.supabase)()
            .from('notifications')
            .select('*')
            .eq('recipient_id', input.userId)
            .order('created_at', { ascending: false })
            .limit(limit + 1);
        if (input.cursor) {
            query = query.lt('created_at', input.cursor);
        }
        if (input.unreadOnly) {
            query = query.eq('is_read', false);
        }
        const result = await query;
        if (result.error) {
            throw new Error(`[NotificationService:list] ${result.error.message}`);
        }
        const rows = (result.data ?? []);
        const hasMore = rows.length > limit;
        if (hasMore)
            rows.pop();
        const nextCursor = hasMore && rows.length > 0
            ? rows[rows.length - 1]['created_at']
            : null;
        return {
            items: rows.map(toNotification),
            next_cursor: nextCursor,
            has_more: hasMore,
        };
    },
    // ── Mark a single notification as read ───────────────────────────────────
    async markRead(notificationId, userId) {
        const { error } = await (0, database_1.supabase)()
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('recipient_id', userId); // scoped to the user — no cross-user mutation
        if (error) {
            throw new Error(`[NotificationService:markRead] ${error.message}`);
        }
        // Decrement Redis badge — floor at 0
        const key = `artsony:notif:${userId}:unread`;
        const count = await (0, redis_client_1.getRedis)().get(key);
        if (count && parseInt(count, 10) > 0) {
            await (0, redis_client_1.getRedis)().decr(key);
        }
    },
    // ── Mark all notifications as read ───────────────────────────────────────
    async markAllRead(userId) {
        const { error } = await (0, database_1.supabase)()
            .from('notifications')
            .update({ is_read: true })
            .eq('recipient_id', userId)
            .eq('is_read', false);
        if (error) {
            throw new Error(`[NotificationService:markAllRead] ${error.message}`);
        }
        // Reset Redis badge to 0
        await (0, redis_client_1.getRedis)().set(`artsony:notif:${userId}:unread`, '0');
    },
    // ── Get unread notification count ─────────────────────────────────────────
    async getUnreadCount(userId) {
        // Serve from Redis cache — the badge counter is maintained incrementally
        const cached = await (0, redis_client_1.getRedis)().get(`artsony:notif:${userId}:unread`);
        if (cached !== null)
            return Math.max(0, parseInt(cached, 10));
        // Cache miss — query DB and repopulate
        const { count, error } = await (0, database_1.supabase)()
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('recipient_id', userId)
            .eq('is_read', false);
        if (error) {
            console.error('[NotificationService:getUnreadCount]', error.message);
            return 0;
        }
        const total = count ?? 0;
        await (0, redis_client_1.getRedis)().setex(`artsony:notif:${userId}:unread`, 300, String(total));
        return total;
    },
};
// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildPreview(body, maxLen = 80) {
    return body.length > maxLen ? `${body.slice(0, maxLen).trimEnd()}…` : body;
}
function toNotification(row) {
    return {
        id: row['id'],
        type: row['type'],
        entity_id: row['entity_id'] ?? null,
        entity_type: row['entity_type'] ?? null,
        actor_id: row['actor_id'] ?? null,
        data: row['data'] ?? {},
        is_read: row['is_read'],
        created_at: new Date(row['created_at']),
    };
}
//# sourceMappingURL=notification.service.js.map