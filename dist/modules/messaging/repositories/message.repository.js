"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageRepository = void 0;
const database_1 = require("../../../config/database");
// ── Mappers ──────────────────────────────────────────────────────────────────
function toMessage(row) {
    return {
        id: row['id'],
        conversation_id: row['conversation_id'],
        sender_id: row['sender_id'],
        body: row['body'],
        type: row['type'],
        reply_to_id: row['reply_to_id'] ?? null,
        // FIX: Cast the incoming JSON directly to MessageMetadata
        metadata: (row['metadata'] ?? {}),
        is_broadcast_root: row['is_broadcast_root'],
        created_at: new Date(row['created_at']),
        edited_at: row['edited_at'] ? new Date(row['edited_at']) : null,
        deleted_at: row['deleted_at'] ? new Date(row['deleted_at']) : null,
    };
}
function toMessageWithSender(row) {
    const senderRaw = (row['users'] ?? row['sender'] ?? {});
    const sender = {
        id: senderRaw['id'] ?? row['sender_id'],
        email: senderRaw['email'] ?? '',
        display_name: senderRaw['display_name'] ?? null,
        avatar_url: senderRaw['avatar_url'] ?? null,
    };
    return { ...toMessage(row), sender };
}
function toMessagePreview(row) {
    return {
        id: row['id'],
        sender_id: row['sender_id'],
        body: row['body'],
        type: row['type'],
        created_at: new Date(row['created_at']),
        deleted_at: row['deleted_at'] ? new Date(row['deleted_at']) : null,
    };
}
// ── Repository ───────────────────────────────────────────────────────────────
exports.messageRepository = {
    // ── Insert a new message ──────────────────────────────────────────────────
    async create(input) {
        const result = await (0, database_1.supabase)()
            .from('messages')
            .insert({
            conversation_id: input.conversationId,
            sender_id: input.senderId,
            body: input.body,
            type: input.type,
            reply_to_id: input.replyToId,
            metadata: input.metadata,
            is_broadcast_root: input.isBroadcastRoot ?? false,
        })
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'MessageRepo:create');
        return toMessage(result.data);
    },
    // ── Find a single message by id ───────────────────────────────────────────
    async findById(id) {
        const result = await (0, database_1.supabase)()
            .from('messages')
            .select('*')
            .eq('id', id)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'MessageRepo:findById');
        return toMessage(result.data);
    },
    // ── Find a message with sender profile joined ─────────────────────────────
    async findByIdWithSender(id) {
        const result = await (0, database_1.supabase)()
            .from('messages')
            .select('*, users!sender_id ( id, email )')
            .eq('id', id)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'MessageRepo:findByIdWithSender');
        return toMessageWithSender(result.data);
    },
    // ── Paginated message list for a conversation (cursor-based) ──────────────
    async listForConversation(input) {
        const limit = Math.min(input.limit ?? 30, 50);
        let query = (0, database_1.supabase)()
            .from('messages')
            .select('*, users!sender_id ( id, email )')
            .eq('conversation_id', input.conversationId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(limit + 1);
        if (input.cursor) {
            const cursorResult = await (0, database_1.supabase)()
                .from('messages')
                .select('created_at')
                .eq('id', input.cursor)
                .single();
            if (!cursorResult.error && cursorResult.data) {
                query = query.lt('created_at', cursorResult.data['created_at']);
            }
        }
        const result = await query;
        (0, database_1.assertNoError)(result, 'MessageRepo:listForConversation');
        const rows = (result.data ?? []);
        const hasMore = rows.length > limit;
        if (hasMore)
            rows.pop();
        const items = rows.map(toMessageWithSender);
        const nextCursor = hasMore && items.length > 0
            ? items[items.length - 1].id
            : null;
        return { items, next_cursor: nextCursor, has_more: hasMore };
    },
    // ── Full-text search within a conversation (via RPC) ──────────────────────
    async search(input) {
        const result = await (0, database_1.supabase)().rpc('search_messages', {
            p_conversation_id: input.conversationId,
            p_user_id: input.userId,
            p_query: input.query,
            p_limit: input.limit ?? 20,
            p_before_id: input.cursor ?? null,
        });
        if (result.error) {
            if (result.error.message?.includes('access denied')) {
                throw new Error('FORBIDDEN');
            }
            throw new Error(`[MessageRepo:search] ${result.error.message}`);
        }
        const rows = (result.data ?? []);
        const messages = rows.map(toMessage);
        if (messages.length === 0)
            return [];
        const senderIds = [...new Set(messages.map((m) => m.sender_id))];
        const profilesResult = await (0, database_1.supabase)()
            .from('users')
            .select('id, email')
            .in('id', senderIds);
        const profileMap = new Map();
        if (!profilesResult.error) {
            for (const u of (profilesResult.data ?? [])) {
                profileMap.set(u['id'], {
                    id: u['id'],
                    email: u['email'],
                    display_name: null,
                    avatar_url: null,
                });
            }
        }
        return messages.map((m) => ({
            ...m,
            sender: profileMap.get(m.sender_id) ?? {
                id: m.sender_id,
                email: '',
                display_name: null,
                avatar_url: null,
            },
        }));
    },
    // ── Edit a message body ───────────────────────────────────────────────────
    async edit(messageId, body) {
        const result = await (0, database_1.supabase)()
            .from('messages')
            .update({ body, edited_at: new Date().toISOString() })
            .eq('id', messageId)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'MessageRepo:edit');
        return toMessage(result.data);
    },
    // ── Soft-delete a message ─────────────────────────────────────────────────
    async softDelete(messageId) {
        const result = await (0, database_1.supabase)()
            .from('messages')
            .update({
            deleted_at: new Date().toISOString(),
            body: '[Message deleted]',
            metadata: {},
        })
            .eq('id', messageId);
        if (result.error) {
            throw new Error(`[MessageRepo:softDelete] ${result.error.message}`);
        }
    },
    // ── Preview of a single message (for inbox last-message display) ──────────
    async getPreview(messageId) {
        const result = await (0, database_1.supabase)()
            .from('messages')
            .select('id, sender_id, body, type, created_at, deleted_at')
            .eq('id', messageId)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'MessageRepo:getPreview');
        return toMessagePreview(result.data);
    },
    // ── Batch preview for multiple message ids ────────────────────────────────
    async getPreviews(messageIds) {
        if (messageIds.length === 0)
            return new Map();
        const result = await (0, database_1.supabase)()
            .from('messages')
            .select('id, sender_id, body, type, created_at, deleted_at')
            .in('id', messageIds);
        (0, database_1.assertNoError)(result, 'MessageRepo:getPreviews');
        const map = new Map();
        for (const row of (result.data ?? [])) {
            map.set(row['id'], toMessagePreview(row));
        }
        return map;
    },
    // ── Mark messages read (via RPC — atomic, batch) ──────────────────────────
    async markRead(input) {
        const result = await (0, database_1.supabase)().rpc('mark_messages_read', {
            p_conversation_id: input.conversationId,
            p_user_id: input.userId,
            p_up_to_message_id: input.upToMessageId,
        });
        if (result.error) {
            throw new Error(`[MessageRepo:markRead] ${result.error.message}`);
        }
        return result.data;
    },
    // ── Get read receipts for a specific message ──────────────────────────────
    async getReadReceipts(messageId) {
        const result = await (0, database_1.supabase)()
            .from('message_reads')
            .select('*')
            .eq('message_id', messageId)
            .order('read_at', { ascending: true });
        (0, database_1.assertNoError)(result, 'MessageRepo:getReadReceipts');
        return (result.data ?? []).map((row) => ({
            id: row['id'],
            message_id: row['message_id'],
            user_id: row['user_id'],
            read_at: new Date(row['read_at']),
        }));
    },
    // ── Check if a user has read a specific message ───────────────────────────
    async hasRead(messageId, userId) {
        const result = await (0, database_1.supabase)()
            .from('message_reads')
            .select('id')
            .eq('message_id', messageId)
            .eq('user_id', userId)
            .single();
        if (result.error?.code === 'PGRST116')
            return false;
        return !result.error;
    },
};
//# sourceMappingURL=message.repository.js.map