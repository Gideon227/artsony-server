"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginSlowDown = exports.apiRateLimit = exports.resetRateLimit = exports.resetPasswordRateLimit = exports.loginRateLimit = exports.registerRateLimit = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const express_slow_down_1 = __importDefault(require("express-slow-down"));
const redis_client_1 = require("../modules/redis/redis.client");
const config_1 = require("../config");
const errors_1 = require("../common/errors");
class RedisStore {
    prefix;
    windowSeconds;
    constructor(prefix, windowMs) {
        this.prefix = prefix;
        this.windowSeconds = Math.ceil(windowMs / 1000);
    }
    async increment(key) {
        const redis = (0, redis_client_1.getRedis)();
        const redisKey = `${this.prefix}${key}`;
        const multi = redis.multi();
        multi.incr(redisKey);
        multi.ttl(redisKey);
        const results = await multi.exec();
        const hits = results?.[0]?.[1] ?? 1;
        const ttl = results?.[1]?.[1] ?? -1;
        if (hits === 1) {
            await redis.expire(redisKey, this.windowSeconds);
        }
        const resetTime = ttl > 0
            ? new Date(Date.now() + ttl * 1000)
            : new Date(Date.now() + this.windowSeconds * 1000);
        return { totalHits: hits, resetTime };
    }
    async decrement(key) {
        await (0, redis_client_1.getRedis)().decr(`${this.prefix}${key}`);
    }
    async resetKey(key) {
        await (0, redis_client_1.getRedis)().del(`${this.prefix}${key}`);
    }
}
const handler = (_req, _res) => {
    throw new errors_1.TooManyRequestsError();
};
// ─── Register: separate bucket, keyed by IP ──────────────────────────────────
// FIX: previously shared the same 'authRateLimit' instance (and therefore the
// same Redis counter) as /login and /reset-password. A few signup retries
// could exhaust the quota before the user ever reached the login form.
exports.registerRateLimit = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.security.rateLimits.auth.windowMs,
    max: config_1.config.security.rateLimits.auth.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? 'unknown',
    handler,
    store: new RedisStore('rl:register:', config_1.config.security.rateLimits.auth.windowMs),
});
// ─── Login: its own bucket, separate from register/reset ─────────────────────
exports.loginRateLimit = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.security.rateLimits.auth.windowMs,
    max: config_1.config.security.rateLimits.auth.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? 'unknown',
    handler,
    store: new RedisStore('rl:login:', config_1.config.security.rateLimits.auth.windowMs),
});
// ─── Password reset (auth-side, e.g. /reset-password): its own bucket ────────
exports.resetPasswordRateLimit = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.security.rateLimits.auth.windowMs,
    max: config_1.config.security.rateLimits.auth.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? 'unknown',
    handler,
    store: new RedisStore('rl:reset-pw:', config_1.config.security.rateLimits.auth.windowMs),
});
// ─── Forgot-password request: 3 requests per hour ─────────────────────────────
exports.resetRateLimit = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.security.rateLimits.passwordReset.windowMs,
    max: config_1.config.security.rateLimits.passwordReset.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${req.ip}:${req.body.email ?? ''}`,
    handler,
    store: new RedisStore('rl:reset:', config_1.config.security.rateLimits.passwordReset.windowMs),
});
// ─── General API: 100 req/min ─────────────────────────────────────────────────
exports.apiRateLimit = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.security.rateLimits.api.windowMs,
    max: config_1.config.security.rateLimits.api.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.auth?.sub ?? req.ip ?? 'unknown',
    handler,
    store: new RedisStore('rl:api:', config_1.config.security.rateLimits.api.windowMs),
});
// ─── Slow-down: progressively delay after 5 requests ─────────────────────────
exports.loginSlowDown = (0, express_slow_down_1.default)({
    windowMs: 15 * 60 * 1000,
    delayAfter: 5,
    delayMs: (used) => (used - 5) * 500, // 500ms per request over limit
    keyGenerator: (req) => req.ip ?? 'unknown',
});
//# sourceMappingURL=rate-limit.middleware.js.map