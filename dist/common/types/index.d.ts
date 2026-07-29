import type { WebSocket } from 'ws';
import { Moodboard } from "./moodboard.types";
export type UserRole = 'USER' | 'ARTIST' | 'MODERATOR' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type AuthProvider = 'local' | 'google' | 'facebook';
export type User = {
    id: string;
    email: string;
    password_hash: string | null;
    provider: AuthProvider;
    provider_id: string | null;
    is_email_verified: boolean;
    onboarded: boolean;
    interests: string[];
    role: UserRole;
    status: UserStatus;
    moodboards?: Moodboard[];
    token_version: number;
    failed_login_attempts: number;
    locked_until: Date | null;
    last_login_at: Date | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
};
export type PublicUser = {
    id: string;
    email: string;
    role: UserRole;
    is_email_verified: boolean;
    onboarded: boolean;
    interests: string[];
    created_at: Date;
};
export type AuthSession = {
    id: string;
    user_id: string;
    refresh_token_hash: string;
    user_agent: string | null;
    ip_address: string | null;
    expires_at: Date;
    created_at: Date;
    last_used_at: Date;
    revoked_at: Date | null;
};
export type PasswordResetToken = {
    id: string;
    user_id: string;
    reset_token_hash: string;
    reset_email: string;
    reset_attempts: number;
    expires_at: Date;
    used_at: Date | null;
    created_at: Date;
};
export type AuditLog = {
    id: string;
    user_id: string | null;
    action: string;
    ip_address: string | null;
    user_agent: string | null;
    metadata: Record<string, unknown>;
    created_at: Date;
};
export type AccessTokenPayload = {
    sub: string;
    sid: string;
    role: UserRole;
    ver: number;
    iat: number;
    exp: number;
    iss: string;
    aud: string;
};
export type OAuthProfile = {
    provider: AuthProvider;
    providerId: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
};
export type RequestWithUser = {
    user: AccessTokenPayload;
    sessionId: string;
};
export type ConversationType = 'direct' | 'broadcast';
export type MessageType = 'text' | 'image' | 'system';
export type ParticipantRole = 'owner' | 'member';
export type Conversation = {
    id: string;
    type: ConversationType;
    title: string | null;
    created_by: string;
    last_message_id: string | null;
    last_activity_at: Date;
    metadata: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
};
export type ConversationWithDetails = Conversation & {
    participants: ConversationParticipant[];
    last_message?: MessagePreview | null;
    unread_count: number;
};
export type ConversationSummary = {
    id: string;
    type: ConversationType;
    title: string | null;
    last_activity_at: Date;
    last_message_id: string | null;
    unread_count: number;
    last_message?: MessagePreview | null;
    other_user?: ParticipantProfile | null;
};
export type ConversationParticipant = {
    id: string;
    conversation_id: string;
    user_id: string;
    role: ParticipantRole;
    last_read_at: Date;
    is_muted: boolean;
    joined_at: Date;
    left_at: Date | null;
};
export type ParticipantProfile = {
    user_id: string;
    role: ParticipantRole;
    last_read_at: Date;
    is_muted: boolean;
    joined_at: Date;
    left_at: Date | null;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
};
export type Message = {
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    type: MessageType;
    reply_to_id: string | null;
    metadata: MessageMetadata;
    is_broadcast_root: boolean;
    created_at: Date;
    edited_at: Date | null;
    deleted_at: Date | null;
};
export type MessageWithSender = Message & {
    sender: SenderProfile;
    reply_to?: MessagePreview | null;
    read_by?: string[];
};
export type MessagePreview = {
    id: string;
    sender_id: string;
    body: string;
    type: MessageType;
    created_at: Date;
    deleted_at: Date | null;
};
export type SenderProfile = {
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
};
export type TextMessageMetadata = Record<string, never>;
export type ImageMessageMetadata = {
    url: string;
    thumbnailUrl: string;
    width: number;
    height: number;
    size: number;
    mimeType: string;
};
export type SystemMessageMetadata = {
    event: SystemMessageEvent;
    payload: Record<string, unknown>;
};
export type SystemMessageEvent = 'user_joined' | 'user_left' | 'title_changed' | 'conversation_created';
export type MessageMetadata = TextMessageMetadata | ImageMessageMetadata | SystemMessageMetadata;
export type MessageRead = {
    id: string;
    message_id: string;
    user_id: string;
    read_at: Date;
};
export type MessageReadSummary = {
    message_id: string;
    total_sent: number;
    total_read: number;
    read_by: Array<{
        user_id: string;
        read_at: Date;
    }>;
    last_read_at: Date | null;
};
export type NotificationType = 'like' | 'comment' | 'reply' | 'follow' | 'sale' | 'order_update' | 'system' | 'message' | 'broadcast' | 'mention';
export type NotificationPreferences = {
    id: string;
    user_id: string;
    push_enabled: boolean;
    email_enabled: boolean;
    ws_enabled: boolean;
    types_muted: NotificationType[];
    updated_at: Date;
};
export type WsClientEvent = WsSendMessageEvent | WsMarkReadEvent | WsTypingStartEvent | WsTypingStopEvent | WsJoinConversationEvent | WsPingEvent;
export type WsSendMessageEvent = {
    event: 'message:send';
    conversation_id: string;
    body: string;
    type?: MessageType;
    reply_to_id?: string | null;
    metadata?: MessageMetadata;
    client_message_id: string;
};
export type WsMarkReadEvent = {
    event: 'message:read';
    conversation_id: string;
    up_to_message_id: string;
};
export type WsTypingStartEvent = {
    event: 'typing:start';
    conversation_id: string;
};
export type WsTypingStopEvent = {
    event: 'typing:stop';
    conversation_id: string;
};
export type WsJoinConversationEvent = {
    event: 'conversation:join';
    conversation_id: string;
};
export type WsPingEvent = {
    event: 'ping';
    ts: number;
};
export type WsServerEvent = WsNewMessageEvent | WsMessageReadEvent | WsTypingEvent | WsNotificationEvent | WsUserOnlineEvent | WsUserOfflineEvent | WsErrorEvent | WsPongEvent | WsConversationUpdatedEvent;
export type WsNewMessageEvent = {
    event: 'message:new';
    message: MessageWithSender;
    conversation_id: string;
    client_message_id?: string;
};
export type WsMessageReadEvent = {
    event: 'message:read';
    conversation_id: string;
    user_id: string;
    up_to_message_id: string;
    read_at: string;
};
export type WsTypingEvent = {
    event: 'typing';
    conversation_id: string;
    user_id: string;
    display_name: string | null;
    is_typing: boolean;
};
export type WsNotificationEvent = {
    event: 'notification:new';
    notification: WsNotificationPayload;
};
export type WsNotificationPayload = {
    id: string;
    type: NotificationType;
    entity_id: string | null;
    entity_type: string | null;
    actor: SenderProfile | null;
    data: Record<string, unknown>;
    created_at: string;
};
export type WsUserOnlineEvent = {
    event: 'user:online';
    user_id: string;
};
export type WsUserOfflineEvent = {
    event: 'user:offline';
    user_id: string;
};
export type WsConversationUpdatedEvent = {
    event: 'conversation:updated';
    conversation_id: string;
    field: 'title' | 'participants' | 'metadata';
};
export type WsErrorEvent = {
    event: 'error';
    code: WsErrorCode;
    message: string;
    origin?: string;
};
export type WsPongEvent = {
    event: 'pong';
    ts: number;
};
export type WsErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_EVENT' | 'RATE_LIMITED' | 'MESSAGE_TOO_LONG' | 'CONVERSATION_NOT_FOUND' | 'PARTICIPANT_NOT_FOUND' | 'INTERNAL_ERROR';
export type CreateDirectConversationInput = {
    initiator_id: string;
    recipient_id: string;
};
export type CreateBroadcastConversationInput = {
    sender_id: string;
    title: string | null;
    recipient_ids: string[];
    initial_body: string;
    metadata?: Record<string, unknown>;
};
export type UpdateConversationInput = {
    title?: string;
    metadata?: Record<string, unknown>;
};
export type ListConversationsInput = {
    user_id: string;
    cursor?: string;
    limit?: number;
    type?: ConversationType;
};
export type SearchConversationsInput = {
    user_id: string;
    query: string;
    limit?: number;
};
export type SendMessageInput = {
    conversation_id: string;
    sender_id: string;
    body: string;
    type?: MessageType;
    reply_to_id?: string | null;
    metadata?: MessageMetadata;
    client_message_id: string;
};
export type EditMessageInput = {
    message_id: string;
    user_id: string;
    body: string;
};
export type DeleteMessageInput = {
    message_id: string;
    user_id: string;
};
export type ListMessagesInput = {
    conversation_id: string;
    user_id: string;
    cursor?: string;
    limit?: number;
};
export type SearchMessagesInput = {
    conversation_id: string;
    user_id: string;
    query: string;
    limit?: number;
    cursor?: string;
};
export type MarkReadInput = {
    conversation_id: string;
    user_id: string;
    up_to_message_id: string;
};
export type CursorPage<T> = {
    items: T[];
    next_cursor: string | null;
    has_more: boolean;
};
export type WsClient = WebSocket & {
    userId: string;
    sessionId: string;
    tokenVersion: number;
    role: UserRole;
    isAlive: boolean;
    connectedAt: Date;
    subscriptions: Set<string>;
};
export type RedisPubSubMessage = {
    channel: string;
    event: WsServerEvent;
};
export type UserConnections = {
    userId: string;
    sockets: Set<WsClient>;
};
export type TypingIndicator = {
    user_id: string;
    conversation_id: string;
    display_name: string | null;
    started_at: number;
};
//# sourceMappingURL=index.d.ts.map