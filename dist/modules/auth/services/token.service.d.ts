import type { AccessTokenPayload, UserRole } from '../../../common/types';
export declare function signAccessToken(payload: {
    userId: string;
    sessionId: string;
    role: UserRole;
    tokenVersion: number;
}): Promise<string>;
export declare function verifyAccessToken(token: string): Promise<AccessTokenPayload>;
export declare function generateRefreshToken(): {
    raw: string;
    hash: string;
};
export declare function hashToken(raw: string): string;
export declare function generateSecureToken(): {
    raw: string;
    hash: string;
};
export declare function generateOAuthState(): string;
//# sourceMappingURL=token.service.d.ts.map