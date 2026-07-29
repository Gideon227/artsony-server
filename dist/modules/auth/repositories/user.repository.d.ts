import type { User, AuthProvider, UserRole } from '../../../common/types';
export type CreateUserInput = {
    username: string;
    email: string;
    password_hash?: string;
    provider?: AuthProvider;
    provider_id?: string;
    role?: UserRole;
};
export type UpdateUserInput = Partial<Pick<User, 'password_hash' | 'is_email_verified' | 'onboarded' | 'interests' | 'role' | 'status' | 'token_version' | 'failed_login_attempts' | 'locked_until' | 'last_login_at' | 'deleted_at' | 'provider_id'>>;
export declare const userRepository: {
    findById(id: string): Promise<User | undefined>;
    findByEmail(email: string): Promise<User | undefined>;
    findByProviderId(provider: AuthProvider, providerId: string): Promise<User | undefined>;
    searchByUsername(query: string, limit?: number): Promise<User[]>;
    create(input: CreateUserInput): Promise<User>;
    update(id: string, input: UpdateUserInput): Promise<User>;
    incrementTokenVersion(id: string): Promise<number>;
    softDelete(id: string): Promise<void>;
    hardDelete(id: string): Promise<void>;
    completeOnboarding(id: string, interests: string[]): Promise<User>;
    recordLoginAttempt(id: string, success: boolean): Promise<void>;
    lockAccount(id: string, until: Date): Promise<void>;
};
//# sourceMappingURL=user.repository.d.ts.map