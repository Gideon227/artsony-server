import type { Message, MessageWithSender, MessagePreview, MessageRead, MessageType, CursorPage, MessageMetadata } from '../../../common/types';
export declare const messageRepository: {
    create(input: {
        conversationId: string;
        senderId: string;
        body: string;
        type: MessageType;
        replyToId: string | null;
        metadata: MessageMetadata;
        isBroadcastRoot?: boolean;
    }): Promise<Message>;
    findById(id: string): Promise<Message | undefined>;
    findByIdWithSender(id: string): Promise<MessageWithSender | undefined>;
    listForConversation(input: {
        conversationId: string;
        cursor?: string;
        limit?: number;
    }): Promise<CursorPage<MessageWithSender>>;
    search(input: {
        conversationId: string;
        userId: string;
        query: string;
        limit?: number;
        cursor?: string;
    }): Promise<MessageWithSender[]>;
    edit(messageId: string, body: string): Promise<Message>;
    softDelete(messageId: string): Promise<void>;
    getPreview(messageId: string): Promise<MessagePreview | undefined>;
    getPreviews(messageIds: string[]): Promise<Map<string, MessagePreview>>;
    markRead(input: {
        conversationId: string;
        userId: string;
        upToMessageId: string;
    }): Promise<number>;
    getReadReceipts(messageId: string): Promise<MessageRead[]>;
    hasRead(messageId: string, userId: string): Promise<boolean>;
};
//# sourceMappingURL=message.repository.d.ts.map