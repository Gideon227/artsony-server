import type { Conversation, ConversationParticipant, ConversationWithDetails, ConversationSummary, ParticipantProfile, ConversationType } from '../../../common/types';
export declare const conversationRepository: {
    getOrCreateDirect(userA: string, userB: string): Promise<string>;
    createBroadcast(input: {
        senderId: string;
        title: string | null;
        recipientIds: string[];
    }): Promise<string>;
    findById(id: string): Promise<Conversation | undefined>;
    findByIdWithDetails(conversationId: string, requestingUserId: string): Promise<ConversationWithDetails | undefined>;
    listForUser(input: {
        userId: string;
        cursor?: string;
        limit?: number;
        type?: ConversationType;
    }): Promise<ConversationSummary[]>;
    search(input: {
        userId: string;
        query: string;
        limit?: number;
    }): Promise<ConversationSummary[]>;
    update(id: string, input: {
        title?: string | null;
        metadata?: Record<string, unknown>;
    }): Promise<Conversation>;
    isParticipant(conversationId: string, userId: string): Promise<boolean>;
    getParticipant(conversationId: string, userId: string): Promise<ConversationParticipant | undefined>;
    getParticipantIds(conversationId: string): Promise<string[]>;
    getParticipantsWithProfiles(conversationId: string): Promise<ParticipantProfile[]>;
    setMuted(conversationId: string, userId: string, muted: boolean): Promise<void>;
    leave(conversationId: string, userId: string): Promise<void>;
    getUnreadCounts(userId: string): Promise<Map<string, number>>;
};
//# sourceMappingURL=conversation.repository.d.ts.map