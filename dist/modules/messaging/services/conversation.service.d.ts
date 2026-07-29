import type { Conversation, ConversationWithDetails, ConversationSummary, CreateDirectConversationInput, CreateBroadcastConversationInput, UpdateConversationInput, ListConversationsInput, SearchConversationsInput, CursorPage } from '../../../common/types';
export declare const conversationService: {
    getOrCreateDirect(input: CreateDirectConversationInput): Promise<{
        conversationId: string;
        isNew: boolean;
    }>;
    createBroadcast(input: CreateBroadcastConversationInput): Promise<string>;
    getById(conversationId: string, requestingUserId: string): Promise<ConversationWithDetails>;
    list(input: ListConversationsInput): Promise<CursorPage<ConversationSummary>>;
    search(input: SearchConversationsInput): Promise<ConversationSummary[]>;
    update(conversationId: string, userId: string, input: UpdateConversationInput): Promise<Conversation>;
    setMuted(conversationId: string, userId: string, muted: boolean): Promise<void>;
    leave(conversationId: string, userId: string): Promise<void>;
    isParticipant(conversationId: string, userId: string): Promise<boolean>;
};
//# sourceMappingURL=conversation.service.d.ts.map