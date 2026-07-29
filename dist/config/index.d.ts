import 'dotenv/config';
export declare const config: {
    readonly env: "development" | "production" | "test";
    readonly port: number;
    readonly supabase: {
        readonly url: string;
        readonly serviceRoleKey: string;
        readonly anonKey: string;
    };
    readonly redis: {
        readonly url: string;
        readonly keyPrefix: "artsony:";
    };
    readonly jwt: {
        readonly privateKey: string;
        readonly publicKey: string;
        readonly accessTokenTtl: number;
        readonly refreshTokenTtl: number;
        readonly issuer: "artsony";
        readonly audience: "artsony-client";
    };
    readonly cookie: {
        readonly domain: string;
        readonly secure: boolean;
        readonly sameSite: "strict";
    };
    readonly app: {
        readonly frontendUrl: string;
        readonly apiUrl: string;
    };
    readonly oauth: {
        readonly google: {
            readonly clientId: string;
            readonly clientSecret: string;
            readonly callbackUrl: string;
        };
        readonly facebook: {
            readonly appId: string;
            readonly appSecret: string;
            readonly callbackUrl: string;
        };
        readonly stateSecret: string;
    };
    readonly email: {
        readonly host: string;
        readonly port: number;
        readonly secure: boolean;
        readonly user: string;
        readonly password: string;
        readonly from: string;
    };
    readonly security: {
        readonly argon2: {
            readonly memoryCost: 65536;
            readonly timeCost: 3;
            readonly parallelism: 4;
        };
        readonly loginMaxAttempts: 5;
        readonly loginLockoutMinutes: 30;
        readonly resetTokenExpiryMinutes: 15;
        readonly resetMaxAttempts: 5;
        readonly rateLimits: {
            readonly auth: {
                readonly windowMs: number;
                readonly max: 30;
            };
            readonly api: {
                readonly windowMs: number;
                readonly max: 100;
            };
            readonly passwordReset: {
                readonly windowMs: number;
                readonly max: 3;
            };
        };
    };
    readonly queue: {
        readonly emailQueue: "artsony:queue:email";
        readonly deletionQueue: "artsony:queue:account-deletion";
        readonly accountDeletionGraceDays: 30;
    };
    readonly wallet: {
        readonly holdPeriodDays: number;
        readonly minWithdrawalAmount: number;
    };
};
export type Config = typeof config;
//# sourceMappingURL=index.d.ts.map