import type { AuthSession } from '../../../common/types';
export declare const sessionRepository: {
    create(input: {
        userId: string;
        refreshTokenHash: string;
        userAgent: string | null;
        ipAddress: string | null;
    }): Promise<AuthSession>;
    findByTokenHash(hash: string): Promise<AuthSession | undefined>;
    findById(id: string): Promise<AuthSession | undefined>;
    rotate(input: {
        oldSessionId: string;
        userId: string;
        newTokenHash: string;
        userAgent: string | null;
        ipAddress: string | null;
    }): Promise<AuthSession>;
    revokeById(id: string): Promise<void>;
    revokeAllForUser(userId: string): Promise<void>;
    updateLastUsed(id: string): Promise<void>;
    purgeExpired(): Promise<number>;
};
//# sourceMappingURL=session.repository.d.ts.map