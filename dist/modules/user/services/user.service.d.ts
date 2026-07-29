import type { User } from '../../../common/types';
export type CompleteOnboardingInput = {
    userId: string;
    interests: string[];
    ctx: {
        ipAddress: string | null;
        userAgent: string | null;
    };
};
export declare function completeOnboarding({ userId, interests, ctx: _ctx, }: CompleteOnboardingInput): Promise<User>;
//# sourceMappingURL=user.service.d.ts.map