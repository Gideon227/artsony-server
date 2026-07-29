"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageService = void 0;
const message_repository_1 = require("../repositories/message.repository");
const conversation_repository_1 = require("../repositories/conversation.repository");
const broadcast_service_1 = require("./broadcast.service");
// Removed unused notificationService import to clean up
const redis_pubsub_1 = require("../../../modules/redis/redis.pubsub");
const redis_client_1 = require("../../../modules/redis/redis.client");
const errors_1 = require("../../../common/errors");
exports.messageService = {
    // ── Send a message ────────────────────────────────────────────────────────
    async send(input) {
        // ── Idempotency check ──────────────────────────────────────────────────
        const { isDuplicate, existingId } = await (0, redis_pubsub_1.checkAndSetIdempotency)(input.client_message_id, 'pending');
        if (isDuplicate && existingId && existingId !== 'pending') {
            const existing = await message_repository_1.messageRepository.findByIdWithSender(existingId);
            if (existing)
                return existing;
        }
        // ── Authorization ──────────────────────────────────────────────────────
        const isParticipant = await conversation_repository_1.conversationRepository.isParticipant(input.conversation_id, input.sender_id);
        if (!isParticipant) {
            throw new errors_1.ForbiddenError('Not a participant of this conversation');
        }
        // ── Validate reply target ──────────────────────────────────────────────
        if (input.reply_to_id) {
            const parent = await message_repository_1.messageRepository.findById(input.reply_to_id);
            if (!parent || parent.conversation_id !== input.conversation_id) {
                throw new errors_1.ValidationError('Reply target not found in this conversation');
            }
            if (parent.deleted_at) {
                throw new errors_1.ValidationError('Cannot reply to a deleted message');
            }
        }
        // ── Persist ────────────────────────────────────────────────────────────
        const message = await message_repository_1.messageRepository.create({
            conversationId: input.conversation_id,
            senderId: input.sender_id,
            body: input.body,
            type: input.type ?? 'text',
            replyToId: input.reply_to_id ?? null,
            metadata: input.metadata ?? {},
        });
        // Update idempotency key with the real message id now that it's persisted
        await (0, redis_client_1.getRedis)().set(`artsony:msg:idem:${input.client_message_id}`, message.id, 'EX', 86_400);
        // ── Fetch with sender profile for the WS payload ───────────────────────
        const withSender = await message_repository_1.messageRepository.findByIdWithSender(message.id);
        if (!withSender)
            throw new Error('Message hydration failed after insert');
        // ── Fan-out delivery ───────────────────────────────────────────────────
        await broadcast_service_1.broadcastService.fanOutMessage(withSender, input.client_message_id);
        return withSender;
    },
    // ── Edit a message ────────────────────────────────────────────────────────
    async edit(input) {
        const message = await message_repository_1.messageRepository.findById(input.message_id);
        if (!message)
            throw new errors_1.NotFoundError('Message');
        if (message.deleted_at)
            throw new errors_1.ForbiddenError('Cannot edit a deleted message');
        if (message.sender_id !== input.user_id) {
            throw new errors_1.ForbiddenError('Only the sender can edit this message');
        }
        if (message.type !== 'text') {
            throw new errors_1.ValidationError('Only text messages can be edited');
        }
        if (!input.body || input.body.trim().length === 0) {
            throw new errors_1.ValidationError('Message body cannot be empty');
        }
        if (input.body.length > 4000) {
            throw new errors_1.ValidationError('Message body exceeds 4000 characters');
        }
        const updated = await message_repository_1.messageRepository.edit(input.message_id, input.body.trim());
        // Notify conversation participants of the edit via WS
        const { connectionManager } = await import('../../ws/connection-manager.js');
        await connectionManager.deliverToConversationGlobal(message.conversation_id, {
            event: 'message:new',
            conversation_id: message.conversation_id,
            message: {
                ...updated,
                sender: { id: input.user_id, email: '', display_name: null, avatar_url: null },
            },
        });
        return updated;
    },
    // ── Soft-delete a message ─────────────────────────────────────────────────
    async delete(input) {
        const message = await message_repository_1.messageRepository.findById(input.message_id);
        if (!message)
            throw new errors_1.NotFoundError('Message');
        if (message.deleted_at)
            return; // already deleted — idempotent
        if (message.sender_id !== input.user_id) {
            const participant = await conversation_repository_1.conversationRepository.getParticipant(message.conversation_id, input.user_id);
            if (!participant || participant.role !== 'owner') {
                throw new errors_1.ForbiddenError('Cannot delete another user\'s message');
            }
        }
        await message_repository_1.messageRepository.softDelete(input.message_id);
        // Deliver the tombstoned message to conversation participants
        const { connectionManager } = await import('../../ws/connection-manager.js');
        await connectionManager.deliverToConversationGlobal(message.conversation_id, {
            event: 'message:new',
            conversation_id: message.conversation_id,
            message: {
                id: message.id,
                conversation_id: message.conversation_id,
                sender_id: message.sender_id,
                body: '[Message deleted]',
                type: message.type,
                reply_to_id: message.reply_to_id,
                metadata: {},
                is_broadcast_root: message.is_broadcast_root,
                created_at: message.created_at,
                edited_at: message.edited_at,
                deleted_at: new Date(),
                sender: { id: message.sender_id, email: '', display_name: null, avatar_url: null },
            },
        });
    },
    // ── List messages (paginated) ─────────────────────────────────────────────
    async list(input) {
        const isParticipant = await conversation_repository_1.conversationRepository.isParticipant(input.conversation_id, input.user_id);
        if (!isParticipant)
            throw new errors_1.ForbiddenError('Not a participant of this conversation');
        return message_repository_1.messageRepository.listForConversation({
            conversationId: input.conversation_id,
            limit: input.limit ?? 30,
            // CONDITIONAL SPREAD: Prevents passing undefined to an exactOptionalProperty
            ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        });
    },
    // ── Search messages within a conversation ─────────────────────────────────
    async search(input) {
        if (!input.query || input.query.trim().length < 2) {
            throw new errors_1.ValidationError('Search query must be at least 2 characters');
        }
        const isParticipant = await conversation_repository_1.conversationRepository.isParticipant(input.conversation_id, input.user_id);
        if (!isParticipant)
            throw new errors_1.ForbiddenError('Not a participant of this conversation');
        return message_repository_1.messageRepository.search({
            conversationId: input.conversation_id,
            userId: input.user_id,
            query: input.query.trim(),
            limit: input.limit ?? 20,
            // CONDITIONAL SPREAD: Prevents passing undefined to an exactOptionalProperty
            ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        });
    },
    // ── Mark messages as read ─────────────────────────────────────────────────
    async markRead(input) {
        const isParticipant = await conversation_repository_1.conversationRepository.isParticipant(input.conversation_id, input.user_id);
        if (!isParticipant)
            throw new errors_1.ForbiddenError('Not a participant of this conversation');
        const count = await message_repository_1.messageRepository.markRead({
            conversationId: input.conversation_id,
            userId: input.user_id,
            upToMessageId: input.up_to_message_id,
        });
        if (count === 0)
            return;
        await (0, redis_client_1.getRedis)().del(`artsony:user:${input.user_id}:unread`);
        const { connectionManager } = await import('../../ws/connection-manager.js');
        await connectionManager.deliverToConversationGlobal(input.conversation_id, {
            event: 'message:read',
            conversation_id: input.conversation_id,
            user_id: input.user_id,
            up_to_message_id: input.up_to_message_id,
            read_at: new Date().toISOString(),
        });
    },
    // ── Get read receipts for a message ──────────────────────────────────────
    async getReadReceipts(messageId, requestingUserId) {
        const message = await message_repository_1.messageRepository.findById(messageId);
        if (!message)
            throw new errors_1.NotFoundError('Message');
        const isParticipant = await conversation_repository_1.conversationRepository.isParticipant(message.conversation_id, requestingUserId);
        if (!isParticipant)
            throw new errors_1.ForbiddenError('Not a participant of this conversation');
        const receipts = await message_repository_1.messageRepository.getReadReceipts(messageId);
        const totalSent = await conversation_repository_1.conversationRepository.getParticipantIds(message.conversation_id);
        return {
            message_id: messageId,
            total_sent: totalSent.length,
            total_read: receipts.length,
            read_by: receipts.map((r) => ({ user_id: r.user_id, read_at: r.read_at })),
            last_read_at: receipts.length > 0 ? receipts[receipts.length - 1].read_at : null,
        };
    },
};
//# sourceMappingURL=message.service.js.map