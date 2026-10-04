import type { NotificationPreferences, NotificationType } from '../../../common/types';
export declare const notificationPreferencesRepository: {
    get(userId: string): Promise<NotificationPreferences>;
    update(userId: string, changes: Partial<Pick<NotificationPreferences, "push_enabled" | "email_enabled" | "ws_enabled" | "types_muted">>): Promise<NotificationPreferences>;
    getEnforcementFlags(userId: string): Promise<{
        types_muted: NotificationType[];
        ws_enabled: boolean;
    }>;
};
//# sourceMappingURL=notification-preferences.repository.d.ts.map