import { conversationRepository } from '../repositories/conversation.repository'
import { messageRepository } from '../repositories/message.repository'
import { getRedis } from '@/modules/redis/redis.client'
import { connectionManager } from '@/modules/ws/connection-manager'
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/common/errors'
import type {
  Conversation,
  ConversationWithDetails,
  ConversationSummary,
  CreateDirectConversationInput,
  CreateBroadcastConversationInput,
  UpdateConversationInput,
  ListConversationsInput,
  SearchConversationsInput,
  CursorPage,
} from '@/common/types'

// ── Cache TTLs ───────────────────────────────────────────────────────────────
const PARTICIPANTS_CACHE_TTL = 5 * 60 // 5 minutes
const UNREAD_CACHE_TTL = 60           // 1 minute

export const conversationService = {

  // ── Create or retrieve a direct conversation ───────────────────────────────

  async getOrCreateDirect(
    input: CreateDirectConversationInput,
  ): Promise<{ conversationId: string; isNew: boolean }> {
    if (input.initiator_id === input.recipient_id) {
      throw new ValidationError('Cannot start a conversation with yourself')
    }

    // The RPC is atomic — safe for concurrent requests
    const convId = await conversationRepository.getOrCreateDirect(
      input.initiator_id,
      input.recipient_id,
    )

    // Subscribe both users to the conversation channel if they are connected
    await connectionManager.addUserToConversation(input.initiator_id, convId)
    await connectionManager.addUserToConversation(input.recipient_id, convId)

    return { conversationId: convId, isNew: false }
  },

  // ── Create a broadcast conversation ───────────────────────────────────────

  async createBroadcast(
    input: CreateBroadcastConversationInput,
  ): Promise<string> {
    if (!input.recipient_ids || input.recipient_ids.length === 0) {
      throw new ValidationError('At least one recipient is required')
    }
    if (input.recipient_ids.length > 1000) {
      throw new ValidationError('Broadcast recipient limit is 1000')
    }
    if (!input.initial_body || input.initial_body.trim().length === 0) {
      throw new ValidationError('Broadcast message body is required')
    }
    if (input.initial_body.length > 4000) {
      throw new ValidationError('Message body exceeds 4000 characters')
    }

    // Remove duplicates and the sender from recipient list
    const uniqueRecipients = [
      ...new Set(input.recipient_ids.filter((id) => id !== input.sender_id)),
    ]

    const convId = await conversationRepository.createBroadcast({
      senderId: input.sender_id,
      title: input.title,
      recipientIds: uniqueRecipients,
    })

    // Subscribe all online recipients to the conversation channel
    const onlineIds = connectionManager.getConnectedUserIds()
    const toSubscribe = uniqueRecipients.filter((id) => onlineIds.includes(id))
    await Promise.allSettled(
      toSubscribe.map((id) => connectionManager.addUserToConversation(id, convId)),
    )

    return convId
  },

  // ── Get a single conversation (with auth) ─────────────────────────────────

  async getById(
    conversationId: string,
    requestingUserId: string,
  ): Promise<ConversationWithDetails> {
    const conv = await conversationRepository.findByIdWithDetails(
      conversationId,
      requestingUserId,
    )
    if (!conv) {
      throw new NotFoundError('Conversation')
    }

    // Hydrate last_message preview if present
    if (conv.last_message_id) {
      conv.last_message = await messageRepository.getPreview(conv.last_message_id) ?? null
    }

    return conv
  },

  // ── List conversations for a user ─────────────────────────────────────────

  async list(input: ListConversationsInput): Promise<CursorPage<ConversationSummary>> {
    const limit = Math.min(input.limit ?? 20, 50)

    const conversations = await conversationRepository.listForUser({
      userId: input.user_id,
      limit,
      // CONDITIONAL SPREAD: Prevents passing undefined values
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
    })

    // Batch fetch unread counts for all returned conversations
    const unreadMap = await conversationRepository.getUnreadCounts(input.user_id)

    // Batch fetch last message previews
    const messageIds = conversations
      .map((c) => c.last_message_id)
      .filter((id): id is string => id !== null)

    const previews = await messageRepository.getPreviews(messageIds)

    const enriched: ConversationSummary[] = conversations.map((c) => ({
      ...c,
      unread_count: unreadMap.get(c.id) ?? 0,
      last_message: c.last_message_id ? (previews.get(c.last_message_id) ?? null) : null,
    }))

    const hasMore = enriched.length === limit
    const nextCursor = hasMore && enriched.length > 0
      ? enriched[enriched.length - 1]!.last_activity_at.toISOString()
      : null

    return { items: enriched, next_cursor: nextCursor, has_more: hasMore }
  },

  // ── Search conversations ───────────────────────────────────────────────────

  async search(input: SearchConversationsInput): Promise<ConversationSummary[]> {
    if (!input.query || input.query.trim().length < 2) {
      throw new ValidationError('Search query must be at least 2 characters')
    }

    const results = await conversationRepository.search({
      userId: input.user_id,
      query: input.query.trim(),
      limit: input.limit ?? 20,
    })

    // Hydrate last message previews
    const messageIds = results
      .map((c) => c.last_message_id)
      .filter((id): id is string => id !== null)

    const previews = await messageRepository.getPreviews(messageIds)

    return results.map((c) => ({
      ...c,
      last_message: c.last_message_id ? (previews.get(c.last_message_id) ?? null) : null,
    }))
  },

  // ── Update conversation title/metadata ────────────────────────────────────

  async update(
    conversationId: string,
    userId: string,
    input: UpdateConversationInput,
  ): Promise<Conversation> {
    const participant = await conversationRepository.getParticipant(conversationId, userId)
    if (!participant) throw new ForbiddenError('Not a participant of this conversation')
    if (participant.role !== 'owner') throw new ForbiddenError('Only the owner can update this conversation')

    const updated = await conversationRepository.update(conversationId, {
      // CONDITIONAL SPREAD: Prevents passing undefined values
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    })

    // Notify all participants the conversation was updated
    await connectionManager.deliverToConversationGlobal(conversationId, {
      event: 'conversation:updated',
      conversation_id: conversationId,
      field: input.title !== undefined ? 'title' : 'metadata',
    })

    return updated
  },

  // ── Mute / unmute a conversation ──────────────────────────────────────────

  async setMuted(
    conversationId: string,
    userId: string,
    muted: boolean,
  ): Promise<void> {
    const isParticipant = await conversationRepository.isParticipant(conversationId, userId)
    if (!isParticipant) throw new ForbiddenError('Not a participant of this conversation')

    await conversationRepository.setMuted(conversationId, userId, muted)
  },

  // ── Leave a conversation ──────────────────────────────────────────────────

  async leave(conversationId: string, userId: string): Promise<void> {
    const isParticipant = await conversationRepository.isParticipant(conversationId, userId)
    if (!isParticipant) throw new ForbiddenError('Not a participant of this conversation')

    await conversationRepository.leave(conversationId, userId)

    // Remove from WS subscription
    await connectionManager.removeUserFromConversation(userId, conversationId)

    // Invalidate participant cache
    await getRedis().del(`artsony:conv:${conversationId}:participants`)
  },

  // ── Authorization check (used by event router) ────────────────────────────

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    // Check cache first
    const cacheKey = `artsony:conv:${conversationId}:participants`
    const cached = await getRedis().sismember(cacheKey, userId)
    if (cached === 1) return true

    const result = await conversationRepository.isParticipant(conversationId, userId)

    // Populate cache on positive result
    if (result) {
      const pipeline = getRedis().pipeline()
      pipeline.sadd(cacheKey, userId)
      pipeline.expire(cacheKey, PARTICIPANTS_CACHE_TTL)
      await pipeline.exec()
    }

    return result
  },
}