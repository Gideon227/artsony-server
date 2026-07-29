"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationService = void 0;
const conversation_repository_1 = require("../repositories/conversation.repository");
const message_repository_1 = require("../repositories/message.repository");
const redis_client_1 = require("../../../modules/redis/redis.client");
const connection_manager_1 = require("../../../modules/ws/connection-manager");
const errors_1 = require("../../../common/errors");
// ── Cache TTLs ───────────────────────────────────────────────────────────────
const PARTICIPANTS_CACHE_TTL = 5 * 60; // 5 minutes
const UNREAD_CACHE_TTL = 60; // 1 minute
exports.conversationService = {
    // ── Create or retrieve a direct conversation ───────────────────────────────
    async getOrCreateDirect(input) {
        if (input.initiator_id === input.recipient_id) {
            throw new errors_1.ValidationError('Cannot start a conversation with yourself');
        }
        // The RPC is atomic — safe for concurrent requests
        const convId = await conversation_repository_1.conversationRepository.getOrCreateDirect(input.initiator_id, input.recipient_id);
        // Subscribe both users to the conversation channel if they are connected
        await connection_manager_1.connectionManager.addUserToConversation(input.initiator_id, convId);
        await connection_manager_1.connectionManager.addUserToConversation(input.recipient_id, convId);
        return { conversationId: convId, isNew: false };
    },
    // ── Create a broadcast conversation ───────────────────────────────────────
    async createBroadcast(input) {
        if (!input.recipient_ids || input.recipient_ids.length === 0) {
            throw new errors_1.ValidationError('At least one recipient is required');
        }
        if (input.recipient_ids.length > 1000) {
            throw new errors_1.ValidationError('Broadcast recipient limit is 1000');
        }
        if (!input.initial_body || input.initial_body.trim().length === 0) {
            throw new errors_1.ValidationError('Broadcast message body is required');
        }
        if (input.initial_body.length > 4000) {
            throw new errors_1.ValidationError('Message body exceeds 4000 characters');
        }
        // Remove duplicates and the sender from recipient list
        const uniqueRecipients = [
            ...new Set(input.recipient_ids.filter((id) => id !== input.sender_id)),
        ];
        const convId = await conversation_repository_1.conversationRepository.createBroadcast({
            senderId: input.sender_id,
            title: input.title,
            recipientIds: uniqueRecipients,
        });
        // Subscribe all online recipients to the conversation channel
        const onlineIds = connection_manager_1.connectionManager.getConnectedUserIds();
        const toSubscribe = uniqueRecipients.filter((id) => onlineIds.includes(id));
        await Promise.allSettled(toSubscribe.map((id) => connection_manager_1.connectionManager.addUserToConversation(id, convId)));
        return convId;
    },
    // ── Get a single conversation (with auth) ─────────────────────────────────
    async getById(conversationId, requestingUserId) {
        const conv = await conversation_repository_1.conversationRepository.findByIdWithDetails(conversationId, requestingUserId);
        if (!conv) {
            throw new errors_1.NotFoundError('Conversation');
        }
        // Hydrate last_message preview if present
        if (conv.last_message_id) {
            conv.last_message = await message_repository_1.messageRepository.getPreview(conv.last_message_id) ?? null;
        }
        return conv;
    },
    // ── List conversations for a user ─────────────────────────────────────────
    async list(input) {
        const limit = Math.min(input.limit ?? 20, 50);
        const conversations = await conversation_repository_1.conversationRepository.listForUser({
            userId: input.user_id,
            limit,
            // CONDITIONAL SPREAD: Prevents passing undefined values
            ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
            ...(input.type !== undefined ? { type: input.type } : {}),
        });
        // Batch fetch unread counts for all returned conversations
        const unreadMap = await conversation_repository_1.conversationRepository.getUnreadCounts(input.user_id);
        // Batch fetch last message previews
        const messageIds = conversations
            .map((c) => c.last_message_id)
            .filter((id) => id !== null);
        const previews = await message_repository_1.messageRepository.getPreviews(messageIds);
        const enriched = conversations.map((c) => ({
            ...c,
            unread_count: unreadMap.get(c.id) ?? 0,
            last_message: c.last_message_id ? (previews.get(c.last_message_id) ?? null) : null,
        }));
        const hasMore = enriched.length === limit;
        const nextCursor = hasMore && enriched.length > 0
            ? enriched[enriched.length - 1].last_activity_at.toISOString()
            : null;
        return { items: enriched, next_cursor: nextCursor, has_more: hasMore };
    },
    // ── Search conversations ───────────────────────────────────────────────────
    async search(input) {
        if (!input.query || input.query.trim().length < 2) {
            throw new errors_1.ValidationError('Search query must be at least 2 characters');
        }
        const results = await conversation_repository_1.conversationRepository.search({
            userId: input.user_id,
            query: input.query.trim(),
            limit: input.limit ?? 20,
        });
        // Hydrate last message previews
        const messageIds = results
            .map((c) => c.last_message_id)
            .filter((id) => id !== null);
        const previews = await message_repository_1.messageRepository.getPreviews(messageIds);
        return results.map((c) => ({
            ...c,
            last_message: c.last_message_id ? (previews.get(c.last_message_id) ?? null) : null,
        }));
    },
    // ── Update conversation title/metadata ────────────────────────────────────
    async update(conversationId, userId, input) {
        const participant = await conversation_repository_1.conversationRepository.getParticipant(conversationId, userId);
        if (!participant)
            throw new errors_1.ForbiddenError('Not a participant of this conversation');
        if (participant.role !== 'owner')
            throw new errors_1.ForbiddenError('Only the owner can update this conversation');
        const updated = await conversation_repository_1.conversationRepository.update(conversationId, {
            // CONDITIONAL SPREAD: Prevents passing undefined values
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        });
        // Notify all participants the conversation was updated
        await connection_manager_1.connectionManager.deliverToConversationGlobal(conversationId, {
            event: 'conversation:updated',
            conversation_id: conversationId,
            field: input.title !== undefined ? 'title' : 'metadata',
        });
        return updated;
    },
    // ── Mute / unmute a conversation ──────────────────────────────────────────
    async setMuted(conversationId, userId, muted) {
        const isParticipant = await conversation_repository_1.conversationRepository.isParticipant(conversationId, userId);
        if (!isParticipant)
            throw new errors_1.ForbiddenError('Not a participant of this conversation');
        await conversation_repository_1.conversationRepository.setMuted(conversationId, userId, muted);
    },
    // ── Leave a conversation ──────────────────────────────────────────────────
    async leave(conversationId, userId) {
        const isParticipant = await conversation_repository_1.conversationRepository.isParticipant(conversationId, userId);
        if (!isParticipant)
            throw new errors_1.ForbiddenError('Not a participant of this conversation');
        await conversation_repository_1.conversationRepository.leave(conversationId, userId);
        // Remove from WS subscription
        await connection_manager_1.connectionManager.removeUserFromConversation(userId, conversationId);
        // Invalidate participant cache
        await (0, redis_client_1.getRedis)().del(`artsony:conv:${conversationId}:participants`);
    },
    // ── Authorization check (used by event router) ────────────────────────────
    async isParticipant(conversationId, userId) {
        // Check cache first
        const cacheKey = `artsony:conv:${conversationId}:participants`;
        const cached = await (0, redis_client_1.getRedis)().sismember(cacheKey, userId);
        if (cached === 1)
            return true;
        const result = await conversation_repository_1.conversationRepository.isParticipant(conversationId, userId);
        // Populate cache on positive result
        if (result) {
            const pipeline = (0, redis_client_1.getRedis)().pipeline();
            pipeline.sadd(cacheKey, userId);
            pipeline.expire(cacheKey, PARTICIPANTS_CACHE_TTL);
            await pipeline.exec();
        }
        return result;
    },
};
//# sourceMappingURL=conversation.service.js.map