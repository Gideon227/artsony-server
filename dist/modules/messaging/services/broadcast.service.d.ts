import type { MessageWithSender } from '../../../common/types';
export declare const broadcastService: {
    fanOutMessage(message: MessageWithSender, clientMessageId: string): Promise<void>;
    fanOutBroadcast(message: MessageWithSender, clientMessageId: string, recipientIds: string[]): Promise<void>;
};
//# sourceMappingURL=broadcast.service.d.ts.map