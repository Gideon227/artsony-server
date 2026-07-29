"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationRepository = void 0;
const database_1 = require("../../../config/database");
// ─── Mappers ──────────────────────────────────────────────────────────────────
function toConversation(row) {
    return {
        id: row['id'],
        type: row['type'],
        title: row['title'] ?? null,
        created_by: row['created_by'],
        last_message_id: row['last_message_id'] ?? null,
        last_activity_at: new Date(row['last_activity_at']),
        metadata: row['metadata'] ?? {},
        created_at: new Date(row['created_at']),
        updated_at: new Date(row['updated_at']),
    };
}
function toParticipant(row) {
    return {
        id: row['id'],
        conversation_id: row['conversation_id'],
        user_id: row['user_id'],
        role: row['role'],
        last_read_at: new Date(row['last_read_at']),
        is_muted: row['is_muted'],
        joined_at: new Date(row['joined_at']),
        left_at: row['left_at'] ? new Date(row['left_at']) : null,
    };
}
function toParticipantProfile(row) {
    return {
        user_id: row['user_id'],
        role: row['role'],
        last_read_at: new Date(row['last_read_at']),
        is_muted: row['is_muted'],
        joined_at: new Date(row['joined_at']),
        left_at: row['left_at'] ? new Date(row['left_at']) : null,
        email: row['email'],
        display_name: row['display_name'] ?? null,
        avatar_url: row['avatar_url'] ?? null,
    };
}
// ─── Repository ───────────────────────────────────────────────────────────────
exports.conversationRepository = {
    // ── Get or create a direct conversation (atomic via RPC) ──────────────────
    async getOrCreateDirect(userA, userB) {
        const result = await (0, database_1.supabase)().rpc('get_or_create_direct_conversation', {
            p_user_a: userA,
            p_user_b: userB,
        });
        if (result.error) {
            throw new Error(`[ConvRepo:getOrCreateDirect] ${result.error.message}`);
        }
        return result.data;
    },
    // ── Create a broadcast conversation (atomic via RPC) ──────────────────────
    async createBroadcast(input) {
        const result = await (0, database_1.supabase)().rpc('create_broadcast_conversation', {
            p_sender_id: input.senderId,
            p_title: input.title,
            p_recipient_ids: input.recipientIds,
        });
        if (result.error) {
            throw new Error(`[ConvRepo:createBroadcast] ${result.error.message}`);
        }
        return result.data;
    },
    // ── Find conversation by id (no auth check — callers must verify access) ──
    async findById(id) {
        const result = await (0, database_1.supabase)()
            .from('conversations')
            .select('*')
            .eq('id', id)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'ConvRepo:findById');
        return toConversation(result.data);
    },
    // ── Get conversation with participants and unread count (via RPC) ─────────
    async findByIdWithDetails(conversationId, requestingUserId) {
        const result = await (0, database_1.supabase)().rpc('get_conversation_with_participants', {
            p_conversation_id: conversationId,
            p_requesting_user: requestingUserId,
        });
        if (result.error) {
            // RPC raises SQLSTATE P0001 for access denied
            if (result.error.message?.includes('access denied'))
                return undefined;
            throw new Error(`[ConvRepo:findByIdWithDetails] ${result.error.message}`);
        }
        const rows = result.data;
        if (!rows || rows.length === 0)
            return undefined;
        const row = rows[0];
        const conv = toConversation(row);
        const rawParticipants = row['participants'] ?? [];
        return {
            ...conv,
            participants: rawParticipants.map((p) => ({
                id: '', // not returned by the RPC aggregation
                conversation_id: conversationId,
                user_id: p['user_id'],
                role: p['role'],
                last_read_at: new Date(p['last_read_at']),
                is_muted: p['is_muted'],
                joined_at: new Date(p['joined_at']),
                left_at: null,
            })),
            unread_count: Number(row['unread_count'] ?? 0),
        };
    },
    // ── List conversations for a user (cursor-paginated) ─────────────────────
    async listForUser(input) {
        const limit = Math.min(input.limit ?? 20, 50);
        let query = (0, database_1.supabase)()
            .from('conversations')
            .select(`
        id,
        type,
        title,
        last_activity_at,
        last_message_id,
        created_by,
        conversation_participants!inner (
          user_id,
          last_read_at,
          left_at
        )
      `)
            .eq('conversation_participants.user_id', input.userId)
            .is('conversation_participants.left_at', null)
            .order('last_activity_at', { ascending: false })
            .limit(limit);
        if (input.cursor) {
            query = query.lt('last_activity_at', input.cursor);
        }
        if (input.type) {
            query = query.eq('type', input.type);
        }
        const result = await query;
        (0, database_1.assertNoError)(result, 'ConvRepo:listForUser');
        const rows = (result.data ?? []);
        return rows.map((row) => ({
            id: row['id'],
            type: row['type'],
            title: row['title'] ?? null,
            last_activity_at: new Date(row['last_activity_at']),
            last_message_id: row['last_message_id'] ?? null,
            unread_count: 0, // populated by service layer via get_conversation_unread_counts RPC
        }));
    },
    // ── Search conversations ──────────────────────────────────────────────────
    async search(input) {
        const result = await (0, database_1.supabase)().rpc('search_conversations', {
            p_user_id: input.userId,
            p_query: input.query,
            p_limit: input.limit ?? 20,
        });
        if (result.error) {
            throw new Error(`[ConvRepo:search] ${result.error.message}`);
        }
        const rows = (result.data ?? []);
        return rows.map((row) => ({
            id: row['conversation_id'],
            type: row['type'],
            title: row['title'] ?? null,
            last_activity_at: new Date(row['last_activity_at']),
            last_message_id: row['last_message_id'] ?? null,
            unread_count: Number(row['unread_count'] ?? 0),
        }));
    },
    // ── Update conversation metadata/title ────────────────────────────────────
    async update(id, input) {
        const payload = { updated_at: new Date().toISOString() };
        if (input.title !== undefined)
            payload['title'] = input.title;
        if (input.metadata !== undefined)
            payload['metadata'] = input.metadata;
        const result = await (0, database_1.supabase)()
            .from('conversations')
            .update(payload)
            .eq('id', id)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'ConvRepo:update');
        return toConversation(result.data);
    },
    // ── Participant checks ────────────────────────────────────────────────────
    async isParticipant(conversationId, userId) {
        const result = await (0, database_1.supabase)()
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .is('left_at', null)
            .single();
        if (result.error?.code === 'PGRST116')
            return false;
        return !result.error;
    },
    async getParticipant(conversationId, userId) {
        const result = await (0, database_1.supabase)()
            .from('conversation_participants')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .is('left_at', null)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'ConvRepo:getParticipant');
        return toParticipant(result.data);
    },
    async getParticipantIds(conversationId) {
        const result = await (0, database_1.supabase)()
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .is('left_at', null);
        (0, database_1.assertNoError)(result, 'ConvRepo:getParticipantIds');
        return (result.data ?? []).map((r) => r.user_id);
    },
    async getParticipantsWithProfiles(conversationId) {
        const result = await (0, database_1.supabase)()
            .from('conversation_participants')
            .select(`
        user_id,
        role,
        last_read_at,
        is_muted,
        joined_at,
        left_at,
        users!inner ( email )
      `)
            .eq('conversation_id', conversationId)
            .is('left_at', null);
        (0, database_1.assertNoError)(result, 'ConvRepo:getParticipantsWithProfiles');
        return (result.data ?? []).map((row) => {
            const user = (row['users'] ?? {});
            return toParticipantProfile({
                ...row,
                email: user['email'],
                display_name: null,
                avatar_url: null,
            });
        });
    },
    // ── Mute / unmute ─────────────────────────────────────────────────────────
    async setMuted(conversationId, userId, muted) {
        const result = await (0, database_1.supabase)()
            .from('conversation_participants')
            .update({ is_muted: muted })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .is('left_at', null);
        if (result.error) {
            throw new Error(`[ConvRepo:setMuted] ${result.error.message}`);
        }
    },
    // ── Leave conversation (via RPC for atomic owner transfer) ────────────────
    async leave(conversationId, userId) {
        const result = await (0, database_1.supabase)().rpc('leave_conversation', {
            p_conversation_id: conversationId,
            p_user_id: userId,
        });
        if (result.error) {
            throw new Error(`[ConvRepo:leave] ${result.error.message}`);
        }
    },
    // ── Unread counts for all of a user's conversations ───────────────────────
    async getUnreadCounts(userId) {
        const result = await (0, database_1.supabase)().rpc('get_conversation_unread_counts', {
            p_user_id: userId,
        });
        if (result.error) {
            throw new Error(`[ConvRepo:getUnreadCounts] ${result.error.message}`);
        }
        const map = new Map();
        const rows = (result.data ?? []);
        for (const row of rows) {
            map.set(row.conversation_id, Number(row.unread_count));
        }
        return map;
    },
};
//# sourceMappingURL=conversation.repository.js.map