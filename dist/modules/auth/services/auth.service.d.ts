import type { User, OAuthProfile } from '../../../common/types';
type TokenPair = {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
};
type AuthContext = {
    ipAddress: string | null;
    userAgent: string | null;
};
export declare function register(input: {
    email: string;
    password: string;
    username: string;
    ctx: AuthContext;
}): Promise<{
    user: User;
    tokens: TokenPair;
}>;
export declare function login(input: {
    email: string;
    password: string;
    ctx: AuthContext;
}): Promise<{
    user: User;
    tokens: TokenPair;
}>;
export declare function refreshTokens(input: {
    rawRefreshToken: string;
    ctx: AuthContext;
}): Promise<TokenPair>;
export declare function logout(input: {
    rawRefreshToken: string;
    userId: string;
    ctx: AuthContext;
}): Promise<void>;
export declare function forgotPassword(input: {
    email: string;
    ctx: AuthContext;
}): Promise<void>;
export declare function resetPassword(input: {
    rawToken: string;
    email: string;
    newPassword: string;
    ctx: AuthContext;
}): Promise<void>;
export declare function handleOAuthProfile(input: {
    profile: OAuthProfile;
    ctx: AuthContext;
}): Promise<{
    user: User;
    tokens: TokenPair;
    isNew: boolean;
}>;
export declare function deleteAccount(input: {
    userId: string;
    password?: string;
    ctx: AuthContext;
}): Promise<void>;
export {};
//# sourceMappingURL=auth.service.d.ts.map