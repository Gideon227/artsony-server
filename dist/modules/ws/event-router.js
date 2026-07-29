"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventRouter = void 0;
const redis_pubsub_1 = require("../../modules/redis/redis.pubsub");
const connection_manager_1 = require("./connection-manager");
const ws_server_1 = require("./ws.server");
const KNOWN_EVENTS = new Set([
    'message:send',
    'message:read',
    'typing:start',
    'typing:stop',
    'conversation:join',
    'ping',
]);
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
    async handle(client, raw) {
        // ── Shape guard ─────────────────────────────────────────────────────────
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return this.error(client, 'INVALID_EVENT', 'Payload must be a JSON object');
        }
        const payload = raw;
        const event = payload['event'];
        if (typeof event !== 'string' || !KNOWN_EVENTS.has(event)) {
            return this.error(client, 'INVALID_EVENT', `Unknown event: ${String(event)}`);
        }
        // ── Rate limiting ────────────────────────────────────────────────────────
        // Ping events are exempt — they are infrastructure, not user actions.
        if (event !== 'ping') {
            const { allowed, remaining, resetIn } = await (0, redis_pubsub_1.checkWsRateLimit)(client.userId);
            if (!allowed) {
                return this.error(client, 'RATE_LIMITED', `Rate limit exceeded. Try again in ${resetIn}s. Remaining: ${remaining}`, event);
            }
        }
        // ── Dispatch ─────────────────────────────────────────────────────────────
        try {
            switch (event) {
                case 'message:send':
                    return await this.handleSendMessage(client, payload);
                case 'message:read':
                    return await this.handleMarkRead(client, payload);
                case 'typing:start':
                    return await this.handleTypingStart(client, payload);
                case 'typing:stop':
                    return await this.handleTypingStop(client, payload);
                case 'conversation:join':
                    return await this.handleJoinConversation(client, payload);
                case 'ping':
                    return await this.handlePing(client, payload);
            }
        }
        catch (err) {
            // Unhandled service errors — log server-side, send generic error to client
            console.error(`[WS:EventRouter] Unhandled error for event "${event}":`, err);
            this.error(client, 'INTERNAL_ERROR', 'An unexpected error occurred', event);
        }
    }
    // ── message:send ─────────────────────────────────────────────────────────────
    async handleSendMessage(client, payload) {
        const { conversation_id, body, type, reply_to_id, metadata, client_message_id } = payload;
        // Field validation
        if (!conversation_id || typeof conversation_id !== 'string') {
            return this.error(client, 'INVALID_EVENT', 'conversation_id is required', 'message:send');
        }
        if (!body || typeof body !== 'string' || body.trim().length === 0) {
            return this.error(client, 'INVALID_EVENT', 'body is required', 'message:send');
        }
        if (body.length > 4000) {
            return this.error(client, 'MESSAGE_TOO_LONG', 'Message body exceeds 4000 characters', 'message:send');
        }
        if (!client_message_id || typeof client_message_id !== 'string') {
            return this.error(client, 'INVALID_EVENT', 'client_message_id is required', 'message:send');
        }
        // Lazy import avoids circular deps (service imports connectionManager which imports eventRouter)
        const { messageService } = await import('../messaging/services/message.service.js');
        await messageService.send({
            conversation_id,
            sender_id: client.userId,
            body: body.trim(),
            type: type ?? 'text',
            reply_to_id: reply_to_id ?? null,
            metadata: metadata ?? {},
            client_message_id,
        });
    }
    // ── message:read ─────────────────────────────────────────────────────────────
    async handleMarkRead(client, payload) {
        const { conversation_id, up_to_message_id } = payload;
        if (!conversation_id || typeof conversation_id !== 'string') {
            return this.error(client, 'INVALID_EVENT', 'conversation_id is required', 'message:read');
        }
        if (!up_to_message_id || typeof up_to_message_id !== 'string') {
            return this.error(client, 'INVALID_EVENT', 'up_to_message_id is required', 'message:read');
        }
        const { messageService } = await import('../messaging/services/message.service.js');
        await messageService.markRead({
            conversation_id,
            user_id: client.userId,
            up_to_message_id,
        });
    }
    // ── typing:start ─────────────────────────────────────────────────────────────
    async handleTypingStart(client, payload) {
        const { conversation_id } = payload;
        if (!conversation_id || typeof conversation_id !== 'string') {
            return this.error(client, 'INVALID_EVENT', 'conversation_id is required', 'typing:start');
        }
        const { conversationService } = await import('../messaging/services/conversation.service.js');
        // Authorization — must be a participant
        const isParticipant = await conversationService.isParticipant(conversation_id, client.userId);
        if (!isParticipant) {
            return this.error(client, 'FORBIDDEN', 'Not a participant of this conversation', 'typing:start');
        }
        const { setTyping, publishToConversation } = await import('../redis/redis.pubsub.js');
        // Fetch display name for the typing indicator label
        const { userRepository } = await import('../auth/repositories/user.repository.js');
        const user = await userRepository.findById(client.userId);
        await setTyping(conversation_id, client.userId, user?.email ?? null);
        await publishToConversation(conversation_id, {
            event: 'typing',
            conversation_id,
            user_id: client.userId,
            display_name: user?.email ?? null,
            is_typing: true,
        });
    }
    // ── typing:stop ──────────────────────────────────────────────────────────────
    async handleTypingStop(client, payload) {
        const { conversation_id } = payload;
        if (!conversation_id || typeof conversation_id !== 'string') {
            return this.error(client, 'INVALID_EVENT', 'conversation_id is required', 'typing:stop');
        }
        const { clearTyping, publishToConversation } = await import('../redis/redis.pubsub.js');
        await clearTyping(conversation_id, client.userId);
        await publishToConversation(conversation_id, {
            event: 'typing',
            conversation_id,
            user_id: client.userId,
            display_name: null,
            is_typing: false,
        });
    }
    // ── conversation:join ─────────────────────────────────────────────────────────
    async handleJoinConversation(client, payload) {
        const { conversation_id } = payload;
        if (!conversation_id || typeof conversation_id !== 'string') {
            return this.error(client, 'INVALID_EVENT', 'conversation_id is required', 'conversation:join');
        }
        const { conversationService } = await import('../messaging/services/conversation.service.js');
        const isParticipant = await conversationService.isParticipant(conversation_id, client.userId);
        if (!isParticipant) {
            return this.error(client, 'FORBIDDEN', 'Not a participant of this conversation', 'conversation:join');
        }
        // Register the subscription so this client receives real-time events for this conversation
        await connection_manager_1.connectionManager.addUserToConversation(client.userId, conversation_id);
    }
    // ── ping ──────────────────────────────────────────────────────────────────────
    async handlePing(client, payload) {
        (0, ws_server_1.sendToClient)(client, {
            event: 'pong',
            ts: payload.ts ?? Date.now(),
        });
    }
    // ── Error helper ──────────────────────────────────────────────────────────────
    error(client, code, message, origin) {
        (0, ws_server_1.sendToClient)(client, {
            event: 'error',
            code,
            message,
            ...(origin !== undefined && { origin }),
        });
    }
}
exports.eventRouter = new EventRouter();
//# sourceMappingURL=event-router.js.map