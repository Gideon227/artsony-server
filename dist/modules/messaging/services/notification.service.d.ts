import type { MessageWithSender, NotificationType } from '../../../common/types';
export declare const notificationService: {
    createMessageNotifications(input: {
        message: MessageWithSender;
        recipientIds: string[];
    }): Promise<void>;
    create(input: {
        recipientId: string;
        actorId: string | null;
        type: NotificationType;
        entityId: string | null;
        entityType: string | null;
        data?: Record<string, unknown>;
    }): Promise<void>;
    list(input: {
        userId: string;
        cursor?: string;
        limit?: number;
        unreadOnly?: boolean;
    }): Promise<{
        items: {
            id: string;
            type: NotificationType;
            entity_id: string | null;
            entity_type: string | null;
            actor_id: string | null;
            data: Record<string, unknown>;
            is_read: boolean;
            created_at: Date;
        }[];
        next_cursor: string | null;
        has_more: boolean;
    }>;
    markRead(notificationId: string, userId: string): Promise<void>;
    markAllRead(userId: string): Promise<void>;
    getUnreadCount(userId: string): Promise<number>;
};
//# sourceMappingURL=notification.service.d.ts.map