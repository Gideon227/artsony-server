import type { User, UserWithProfile, UserProfileFields, PrivacySettings, AuthProvider, UserRole } from '../../../common/types';
export type CreateUserInput = {
    username: string;
    email: string;
    password_hash?: string;
    provider?: AuthProvider;
    provider_id?: string;
    role?: UserRole;
};
export type UpdateUserInput = Partial<Pick<User, 'username' | 'password_hash' | 'is_email_verified' | 'onboarded' | 'interests' | 'role' | 'status' | 'token_version' | 'failed_login_attempts' | 'locked_until' | 'last_login_at' | 'deleted_at' | 'provider_id'>>;
export declare const userRepository: {
    findById(id: string): Promise<User | undefined>;
    findByEmail(email: string): Promise<User | undefined>;
    findByProviderId(provider: AuthProvider, providerId: string): Promise<User | undefined>;
    searchByUsername(query: string, limit?: number): Promise<User[]>;
    findPublicProfilesByIds(ids: string[]): Promise<Array<{
        id: string;
        username: string;
        role: string;
        profile: {
            display_name: string | null;
            avatar_url: string | null;
        } | null;
    }>>;
    create(input: CreateUserInput): Promise<User>;
    update(id: string, input: UpdateUserInput): Promise<User>;
    incrementTokenVersion(id: string): Promise<number>;
    softDelete(id: string): Promise<void>;
    findByIdIncludingDeleted(id: string): Promise<User | undefined>;
    findPurgeCandidates(cutoff: Date, limit?: number): Promise<User[]>;
    purgeUser(id: string): Promise<void>;
    hardDelete(id: string): Promise<void>;
    completeOnboarding(id: string, interests: string[]): Promise<User>;
    recordLoginAttempt(id: string, success: boolean): Promise<void>;
    lockAccount(id: string, until: Date): Promise<void>;
    getPrivacySettings(userId: string): Promise<PrivacySettings>;
    updatePrivacySettings(userId: string, settings: Partial<PrivacySettings>): Promise<PrivacySettings>;
    findByIdWithProfile(id: string): Promise<UserWithProfile | undefined>;
    isUsernameTaken(username: string, excludingUserId: string): Promise<boolean>;
    upsertProfile(userId: string, username: string, fields: Partial<Pick<UserProfileFields, "display_name" | "avatar_url" | "bio" | "country" | "state" | "city" | "background_url" | "website_url" | "behance_url" | "pinterest_url" | "twitter_url" | "linkedin_url">>): Promise<void>;
};
//# sourceMappingURL=user.repository.d.ts.map