import type { User, UserWithProfile, PrivacySettings } from '../../../common/types';
export type CompleteOnboardingInput = {
    userId: string;
    interests: string[];
    ctx: {
        ipAddress: string | null;
        userAgent: string | null;
    };
};
export declare function completeOnboarding({ userId, interests, ctx: _ctx, }: CompleteOnboardingInput): Promise<User>;
export type UpdateProfileBody = {
    username?: string;
    display_name?: string | null;
    bio?: string | null;
    country?: string | null;
    state?: string | null;
    city?: string | null;
    interests?: string[];
    avatar_url?: string | null;
    background_url?: string | null;
    website_url?: string | null;
    behance_url?: string | null;
    pinterest_url?: string | null;
    twitter_url?: string | null;
    linkedin_url?: string | null;
};
export type UpdateProfileInput = {
    userId: string;
    input: UpdateProfileBody;
};
export declare function updateProfile({ userId, input }: UpdateProfileInput): Promise<UserWithProfile>;
export declare function getPrivacySettings(userId: string): Promise<PrivacySettings>;
export declare function updatePrivacySettings(userId: string, settings: Partial<PrivacySettings>): Promise<PrivacySettings>;
export type InteractionPermissions = {
    can_message: boolean;
    can_comment: boolean;
    can_purchase: boolean;
};
export declare function getInteractionPermissions(requesterId: string, targetUserId: string): Promise<InteractionPermissions>;
//# sourceMappingURL=user.service.d.ts.map