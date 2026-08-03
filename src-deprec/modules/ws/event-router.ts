import { checkWsRateLimit } from '@/modules/redis/redis.pubsub'
import { connectionManager } from './connection-manager'
import { sendToClient } from './ws.server'
import type {
  WsClient,
  WsClientEvent,
  WsSendMessageEvent,
  WsMarkReadEvent,
  WsTypingStartEvent,
  WsTypingStopEvent,
  WsJoinConversationEvent,
  WsPingEvent,
  WsErrorCode,
} from '@/common/types'

// ─── Handler registry ──────────────────────────────────────────────────────────
// Each event type maps to a dedicated handler function.
// Handlers are imported lazily to avoid circular dependencies with the service layer.

type EventHandler = (client: WsClient, payload: WsClientEvent) => Promise<void>

const KNOWN_EVENTS = new Set([
  'message:send',
  'message:read',
  'typing:start',
  'typing:stop',
  'conversation:join',
  'ping',
])

// ─── EventRouter ───────────────────────────────────────────────────────────────

class EventRouter {
  /**
   * Entry point for every raw message arriving from a WebSocket client.
   * Responsibilities:
   *   1. Parse and narrow the event type
   *   2. Apply per-user rate limiting
   *   3. Validate the payload shape
   *   4. Dispatch to the appropriate handler
   *   5. Return typed error events on any failure
   */
  async handle(client: WsClient, raw: unknown): Promise<void> {
    // ── Shape guard ─────────────────────────────────────────────────────────
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return this.error(client, 'INVALID_EVENT', 'Payload must be a JSON object')
    }

    const payload = raw as Record<string, unknown>
    const event   = payload['event']

    if (typeof event !== 'string' || !KNOWN_EVENTS.has(event)) {
      return this.error(client, 'INVALID_EVENT', `Unknown event: ${String(event)}`)
    }

    // ── Rate limiting ────────────────────────────────────────────────────────
    // Ping events are exempt — they are infrastructure, not user actions.
    if (event !== 'ping') {
      const { allowed, remaining, resetIn } = await checkWsRateLimit(client.userId)
      if (!allowed) {
        return this.error(
          client,
          'RATE_LIMITED',
          `Rate limit exceeded. Try again in ${resetIn}s. Remaining: ${remaining}`,
          event,
        )
      }
    }

    // ── Dispatch ─────────────────────────────────────────────────────────────
    try {
      switch (event) {
        case 'message:send':
          return await this.handleSendMessage(client, payload as unknown as WsSendMessageEvent)

        case 'message:read':
          return await this.handleMarkRead(client, payload as unknown as WsMarkReadEvent)

        case 'typing:start':
          return await this.handleTypingStart(client, payload as unknown as WsTypingStartEvent)

        case 'typing:stop':
          return await this.handleTypingStop(client, payload as unknown as WsTypingStopEvent)

        case 'conversation:join':
          return await this.handleJoinConversation(client, payload as unknown as WsJoinConversationEvent)

        case 'ping':
          return await this.handlePing(client, payload as unknown as WsPingEvent)
      }
    } catch (err) {
      // Unhandled service errors — log server-side, send generic error to client
      console.error(`[WS:EventRouter] Unhandled error for event "${event}":`, err)
      this.error(client, 'INTERNAL_ERROR', 'An unexpected error occurred', event)
    }
  }

  // ── message:send ─────────────────────────────────────────────────────────────

  private async handleSendMessage(
    client:  WsClient,
    payload: WsSendMessageEvent,
  ): Promise<void> {
    const { conversation_id, body, type, reply_to_id, metadata, client_message_id } = payload

    // Field validation
    if (!conversation_id || typeof conversation_id !== 'string') {
      return this.error(client, 'INVALID_EVENT', 'conversation_id is required', 'message:send')
    }
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return this.error(client, 'INVALID_EVENT', 'body is required', 'message:send')
    }
    if (body.length > 4000) {
      return this.error(client, 'MESSAGE_TOO_LONG', 'Message body exceeds 4000 characters', 'message:send')
    }
    if (!client_message_id || typeof client_message_id !== 'string') {
      return this.error(client, 'INVALID_EVENT', 'client_message_id is required', 'message:send')
    }

    // Lazy import avoids circular deps (service imports connectionManager which imports eventRouter)
    const { messageService } = await import('../messaging/services/message.service.js')

    await messageService.send({
      conversation_id,
      sender_id:         client.userId,
      body:              body.trim(),
      type:              type ?? 'text',
      reply_to_id:       reply_to_id ?? null,
      metadata:          metadata ?? {},
      client_message_id,
    })
  }

  // ── message:read ─────────────────────────────────────────────────────────────

  private async handleMarkRead(
    client:  WsClient,
    payload: WsMarkReadEvent,
  ): Promise<void> {
    const { conversation_id, up_to_message_id } = payload

    if (!conversation_id || typeof conversation_id !== 'string') {
      return this.error(client, 'INVALID_EVENT', 'conversation_id is required', 'message:read')
    }
    if (!up_to_message_id || typeof up_to_message_id !== 'string') {
      return this.error(client, 'INVALID_EVENT', 'up_to_message_id is required', 'message:read')
    }

    const { messageService } = await import('../messaging/services/message.service.js')

    await messageService.markRead({
      conversation_id,
      user_id:           client.userId,
      up_to_message_id,
    })
  }

  // ── typing:start ─────────────────────────────────────────────────────────────

  private async handleTypingStart(
    client:  WsClient,
    payload: WsTypingStartEvent,
  ): Promise<void> {
    const { conversation_id } = payload

    if (!conversation_id || typeof conversation_id !== 'string') {
      return this.error(client, 'INVALID_EVENT', 'conversation_id is required', 'typing:start')
    }

    const { conversationService } = await import('../messaging/services/conversation.service.js')

    // Authorization — must be a participant
    const isParticipant = await conversationService.isParticipant(
      conversation_id,
      client.userId,
    )
    if (!isParticipant) {
      return this.error(client, 'FORBIDDEN', 'Not a participant of this conversation', 'typing:start')
    }

    const { setTyping, publishToConversation } = await import('../redis/redis.pubsub.js')

    // Fetch display name for the typing indicator label
    const { userRepository } = await import('../auth/repositories/user.repository.js')
    const user = await userRepository.findById(client.userId)

    await setTyping(conversation_id, client.userId, user?.email ?? null)

    await publishToConversation(conversation_id, {
      event:           'typing',
      conversation_id,
      user_id:         client.userId,
      display_name:    user?.email ?? null,
      is_typing:       true,
    })
  }

  // ── typing:stop ──────────────────────────────────────────────────────────────

  private async handleTypingStop(
    client:  WsClient,
    payload: WsTypingStopEvent,
  ): Promise<void> {
    const { conversation_id } = payload

    if (!conversation_id || typeof conversation_id !== 'string') {
      return this.error(client, 'INVALID_EVENT', 'conversation_id is required', 'typing:stop')
    }

    const { clearTyping, publishToConversation } = await import('../redis/redis.pubsub.js')

    await clearTyping(conversation_id, client.userId)

    await publishToConversation(conversation_id, {
      event: 'typing',
      conversation_id,
      user_id: client.userId,
      display_name: null,
      is_typing: false,
    })
  }

  // ── conversation:join ─────────────────────────────────────────────────────────

  private async handleJoinConversation(
    client:  WsClient,
    payload: WsJoinConversationEvent,
  ): Promise<void> {
    const { conversation_id } = payload

    if (!conversation_id || typeof conversation_id !== 'string') {
      return this.error(client, 'INVALID_EVENT', 'conversation_id is required', 'conversation:join')
    }

    const { conversationService } = await import('../messaging/services/conversation.service.js')

    const isParticipant = await conversationService.isParticipant(
      conversation_id,
      client.userId,
    )
    if (!isParticipant) {
      return this.error(client, 'FORBIDDEN', 'Not a participant of this conversation', 'conversation:join')
    }

    // Register the subscription so this client receives real-time events for this conversation
    await connectionManager.addUserToConversation(client.userId, conversation_id)
  }

  // ── ping ──────────────────────────────────────────────────────────────────────

  private async handlePing(client: WsClient, payload: WsPingEvent): Promise<void> {
    sendToClient(client, {
      event: 'pong',
      ts:    payload.ts ?? Date.now(),
    })
  }

  // ── Error helper ──────────────────────────────────────────────────────────────

  private error(
    client:  WsClient,
    code:    WsErrorCode,
    message: string,
    origin?: string,
  ): void {
    sendToClient(client, {
      event: 'error',
      code,
      message,
      ...(origin !== undefined && { origin }),
    })
  }
}

export const eventRouter = new EventRouter()