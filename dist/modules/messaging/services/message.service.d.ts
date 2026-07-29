import type { Message, MessageWithSender, SendMessageInput, EditMessageInput, DeleteMessageInput, ListMessagesInput, SearchMessagesInput, MarkReadInput, CursorPage } from '../../../common/types';
export declare const messageService: {
    send(input: SendMessageInput): Promise<MessageWithSender>;
    edit(input: EditMessageInput): Promise<Message>;
    delete(input: DeleteMessageInput): Promise<void>;
    list(input: ListMessagesInput): Promise<CursorPage<MessageWithSender>>;
    search(input: SearchMessagesInput): Promise<MessageWithSender[]>;
    markRead(input: MarkReadInput): Promise<void>;
    getReadReceipts(messageId: string, requestingUserId: string): Promise<{
        message_id: string;
        total_sent: number;
        total_read: number;
        read_by: {
            user_id: string;
            read_at: Date;
        }[];
        last_read_at: Date | null;
    }>;
};
//# sourceMappingURL=message.service.d.ts.map