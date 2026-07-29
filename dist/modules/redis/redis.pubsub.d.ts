import type { WsServerEvent } from '../../common/types';
export declare const PubSubChannels: {
    readonly conversation: (id: string) => string;
    readonly user: (id: string) => string;
    readonly broadcast: () => string;
};
type ChannelHandler = (event: WsServerEvent) => void;
/**
 * Publish an event to a channel.
 * Uses the shared publisher client (getRedis()) — NOT the subscriber.
 *
 * @param channel  Full channel name from PubSubChannels.*
 * @param event    The WsServerEvent to broadcast to all subscribers on this channel
 */
export declare function publish(channel: string, event: WsServerEvent): Promise<void>;
/**
 * Subscribe to a channel and register a handler.
 * Safe to call multiple times with the same channel and different handlers.
 * Returns an unsubscribe function for clean teardown.
 */
export declare function subscribe(channel: string, handler: ChannelHandler): Promise<() => Promise<void>>;
/**
 * Subscribe to all events for a conversation.
 * Convenience wrapper used by the WS gateway when a client joins a conversation.
 */
export declare function subscribeToConversation(conversationId: string, handler: ChannelHandler): Promise<() => Promise<void>>;
/**
 * Subscribe to all events for a user (notifications, presence, inbox updates).
 */
export declare function subscribeToUser(userId: string, handler: ChannelHandler): Promise<() => Promise<void>>;
/**
 * Publish an event to a conversation channel.
 * Called by message.service after persisting a message.
 */
export declare function publishToConversation(conversationId: string, event: WsServerEvent): Promise<void>;
/**
 * Publish an event to a user's personal channel.
 * Called by notification.service when generating a notification.
 */
export declare function publishToUser(userId: string, event: WsServerEvent): Promise<void>;
/**
 * Gracefully close the subscriber connection.
 * Called during server shutdown to allow in-flight messages to drain.
 */
export declare function closePubSub(): Promise<void>;
export declare function setTyping(conversationId: string, userId: string, displayName: string | null): Promise<void>;
export declare function clearTyping(conversationId: string, userId: string): Promise<void>;
export declare function getTypingUsers(conversationId: string): Promise<Array<{
    userId: string;
    displayName: string | null;
    started_at: number;
}>>;
export declare function setUserOnline(userId: string): Promise<void>;
export declare function setUserOffline(userId: string): Promise<void>;
export declare function refreshPresence(userId: string): Promise<void>;
export declare function isUserOnline(userId: string): Promise<boolean>;
export declare function getOnlineUserIds(userIds: string[]): Promise<string[]>;
export declare function checkAndSetIdempotency(clientMessageId: string, persistedMessageId: string): Promise<{
    isDuplicate: boolean;
    existingId: string | null;
}>;
export declare function checkWsRateLimit(userId: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetIn: number;
}>;
export {};
//# sourceMappingURL=redis.pubsub.d.ts.map