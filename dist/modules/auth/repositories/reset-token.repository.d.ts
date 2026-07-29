import type { PasswordResetToken } from '../../../common/types';
export declare const resetTokenRepository: {
    create(input: {
        userId: string;
        tokenHash: string;
        email: string;
    }): Promise<PasswordResetToken>;
    findValid(input: {
        tokenHash: string;
        email: string;
    }): Promise<PasswordResetToken | undefined>;
    incrementAttempts(id: string): Promise<void>;
    markUsed(id: string): Promise<void>;
    invalidateAllForUser(userId: string): Promise<void>;
};
//# sourceMappingURL=reset-token.repository.d.ts.map