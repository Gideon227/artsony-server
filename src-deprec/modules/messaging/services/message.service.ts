import { messageRepository } from '../repositories/message.repository'
import { conversationRepository } from '../repositories/conversation.repository'
import { broadcastService } from './broadcast.service'
// Removed unused notificationService import to clean up
import { checkAndSetIdempotency } from '@/modules/redis/redis.pubsub'
import { getRedis } from '@/modules/redis/redis.client'
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/common/errors'
import type {
  Message,
  MessageWithSender,
  SendMessageInput,
  EditMessageInput,
  DeleteMessageInput,
  ListMessagesInput,
  SearchMessagesInput,
  MarkReadInput,
  CursorPage,
} from '@/common/types'

export const messageService = {

  // ── Send a message ────────────────────────────────────────────────────────

    async send(input: SendMessageInput): Promise<MessageWithSender> {
        // ── Idempotency check ──────────────────────────────────────────────────
        const { isDuplicate, existingId } = await checkAndSetIdempotency(
        input.client_message_id,
        'pending',   
        )

        if (isDuplicate && existingId && existingId !== 'pending') {
        const existing = await messageRepository.findByIdWithSender(existingId)
        if (existing) return existing
        }

        // ── Authorization ──────────────────────────────────────────────────────
        const isParticipant = await conversationRepository.isParticipant(
        input.conversation_id,
        input.sender_id,
        )
        if (!isParticipant) {
        throw new ForbiddenError('Not a participant of this conversation')
        }

        // ── Validate reply target ──────────────────────────────────────────────
        if (input.reply_to_id) {
        const parent = await messageRepository.findById(input.reply_to_id)
        if (!parent || parent.conversation_id !== input.conversation_id) {
            throw new ValidationError('Reply target not found in this conversation')
        }
        if (parent.deleted_at) {
            throw new ValidationError('Cannot reply to a deleted message')
        }
        }

        // ── Persist ────────────────────────────────────────────────────────────
        const message = await messageRepository.create({
        conversationId: input.conversation_id,
        senderId:       input.sender_id,
        body:           input.body,
        type:           input.type ?? 'text',
        replyToId:      input.reply_to_id ?? null,
        metadata:       input.metadata ?? {},
        })

        // Update idempotency key with the real message id now that it's persisted
        await getRedis().set(
        `artsony:msg:idem:${input.client_message_id}`,
        message.id,
        'EX',
        86_400,
        )

        // ── Fetch with sender profile for the WS payload ───────────────────────
        const withSender = await messageRepository.findByIdWithSender(message.id)
        if (!withSender) throw new Error('Message hydration failed after insert')

        // ── Fan-out delivery ───────────────────────────────────────────────────
        await broadcastService.fanOutMessage(withSender, input.client_message_id)

        return withSender
    },

    // ── Edit a message ────────────────────────────────────────────────────────

    async edit(input: EditMessageInput): Promise<Message> {
        const message = await messageRepository.findById(input.message_id)
        if (!message) throw new NotFoundError('Message')
        if (message.deleted_at) throw new ForbiddenError('Cannot edit a deleted message')
        if (message.sender_id !== input.user_id) {
        throw new ForbiddenError('Only the sender can edit this message')
        }
        if (message.type !== 'text') {
        throw new ValidationError('Only text messages can be edited')
        }
        if (!input.body || input.body.trim().length === 0) {
        throw new ValidationError('Message body cannot be empty')
        }
        if (input.body.length > 4000) {
        throw new ValidationError('Message body exceeds 4000 characters')
        }

        const updated = await messageRepository.edit(input.message_id, input.body.trim())

        // Notify conversation participants of the edit via WS
        const { connectionManager } = await import('../../ws/connection-manager.js')
        await connectionManager.deliverToConversationGlobal(message.conversation_id, {
        event:           'message:new',
        conversation_id: message.conversation_id,
        message: {
            ...updated,
            sender: { id: input.user_id, email: '', display_name: null, avatar_url: null },
        },
        })

        return updated
    },

    // ── Soft-delete a message ─────────────────────────────────────────────────

    async delete(input: DeleteMessageInput): Promise<void> {
        const message = await messageRepository.findById(input.message_id)
        if (!message) throw new NotFoundError('Message')
        if (message.deleted_at) return   // already deleted — idempotent

        if (message.sender_id !== input.user_id) {
        const participant = await conversationRepository.getParticipant(
            message.conversation_id,
            input.user_id,
        )
        if (!participant || participant.role !== 'owner') {
            throw new ForbiddenError('Cannot delete another user\'s message')
        }
        }

        await messageRepository.softDelete(input.message_id)

        // Deliver the tombstoned message to conversation participants
        const { connectionManager } = await import('../../ws/connection-manager.js')
        await connectionManager.deliverToConversationGlobal(message.conversation_id, {
        event:           'message:new',
        conversation_id: message.conversation_id,
        message: {
            id: message.id,
            conversation_id:   message.conversation_id,
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
        })
    },

    // ── List messages (paginated) ─────────────────────────────────────────────

    async list(input: ListMessagesInput): Promise<CursorPage<MessageWithSender>> {
        const isParticipant = await conversationRepository.isParticipant(
        input.conversation_id,
        input.user_id,
        )
        if (!isParticipant) throw new ForbiddenError('Not a participant of this conversation')

        return messageRepository.listForConversation({
        conversationId: input.conversation_id,
        limit: input.limit ?? 30,
        // CONDITIONAL SPREAD: Prevents passing undefined to an exactOptionalProperty
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        })
    },

    // ── Search messages within a conversation ─────────────────────────────────

    async search(input: SearchMessagesInput): Promise<MessageWithSender[]> {
        if (!input.query || input.query.trim().length < 2) {
            throw new ValidationError('Search query must be at least 2 characters')
        }

        const isParticipant = await conversationRepository.isParticipant(
            input.conversation_id,
            input.user_id,
        )
        if (!isParticipant) throw new ForbiddenError('Not a participant of this conversation')

        return messageRepository.search({
            conversationId: input.conversation_id,
            userId: input.user_id,
            query: input.query.trim(),
            limit: input.limit ?? 20,
            // CONDITIONAL SPREAD: Prevents passing undefined to an exactOptionalProperty
            ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        })
    },

    // ── Mark messages as read ─────────────────────────────────────────────────

    async markRead(input: MarkReadInput): Promise<void> {
        const isParticipant = await conversationRepository.isParticipant(
            input.conversation_id,
            input.user_id,
        )
        if (!isParticipant) throw new ForbiddenError('Not a participant of this conversation')

        const count = await messageRepository.markRead({
            conversationId:  input.conversation_id,
            userId:          input.user_id,
            upToMessageId:   input.up_to_message_id,
        })

        if (count === 0) return  

        await getRedis().del(`artsony:user:${input.user_id}:unread`)

        const { connectionManager } = await import('../../ws/connection-manager.js')
        await connectionManager.deliverToConversationGlobal(input.conversation_id, {
            event: 'message:read',
            conversation_id:  input.conversation_id,
            user_id: input.user_id,
            up_to_message_id: input.up_to_message_id,
            read_at: new Date().toISOString(),
        })
    },

    // ── Get read receipts for a message ──────────────────────────────────────

    async getReadReceipts(messageId: string, requestingUserId: string) {
        const message = await messageRepository.findById(messageId)
        if (!message) throw new NotFoundError('Message')

        const isParticipant = await conversationRepository.isParticipant(
            message.conversation_id,
            requestingUserId,
        )
        if (!isParticipant) throw new ForbiddenError('Not a participant of this conversation')

        const receipts = await messageRepository.getReadReceipts(messageId)
        const totalSent = await conversationRepository.getParticipantIds(message.conversation_id)

        return {
            message_id: messageId,
            total_sent: totalSent.length,
            total_read: receipts.length,
            read_by: receipts.map((r) => ({ user_id: r.user_id, read_at: r.read_at })),
            last_read_at: receipts.length > 0 ? receipts[receipts.length - 1]!.read_at : null,
        }
    },
}