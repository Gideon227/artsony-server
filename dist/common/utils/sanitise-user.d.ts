import type { User, UserWithProfile } from '../../common/types';
export declare function sanitiseUser<T extends User>(user: T): Omit<T, "failed_login_attempts" | "locked_until" | "password_hash" | "token_version">;
export type SafeUser = ReturnType<typeof sanitiseUser<User>>;
export type SafeUserWithProfile = ReturnType<typeof sanitiseUser<UserWithProfile>>;
//# sourceMappingURL=sanitise-user.d.ts.map