import type { AuditLog } from '../../../common/types';
export type AuditAction = 'AUTH_REGISTER' | 'AUTH_LOGIN' | 'AUTH_LOGIN_FAILED' | 'AUTH_LOGOUT' | 'AUTH_REFRESH' | 'AUTH_PASSWORD_RESET_REQUEST' | 'AUTH_PASSWORD_RESET_SUCCESS' | 'AUTH_PASSWORD_CHANGE' | 'AUTH_ACCOUNT_LOCKED' | 'AUTH_EMAIL_VERIFIED' | 'AUTH_OAUTH_LOGIN' | 'AUTH_ACCOUNT_DELETE_INITIATED' | 'AUTH_ACCOUNT_DELETED' | 'AUTH_SUSPICIOUS_REFRESH' | 'SELLER_REGISTRATION_SUBMITTED' | 'SELLER_REGISTRATION_APPROVED' | 'SELLER_REGISTRATION_REJECTED' | 'SELLER_REGISTRATION_SUSPENDED' | 'SELLER_REGISTRATION_REACTIVATED';
export declare const auditRepository: {
    log(input: {
        userId?: string;
        action: AuditAction;
        ipAddress?: string;
        userAgent?: string;
        metadata?: Record<string, unknown>;
    }): void;
    findByUserId(userId: string, limit?: number): Promise<AuditLog[]>;
};
//# sourceMappingURL=audit.repository.d.ts.map