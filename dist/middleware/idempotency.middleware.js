"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.idempotencyGuard = idempotencyGuard;
const redis_client_1 = require("../modules/redis/redis.client");
const errors_1 = require("../common/errors");
// ── Middleware factory ─────────────────────────────────────────────────────────
function idempotencyGuard() {
    return async function (req, res, next) {
        if (!req.auth)
            return next();
        const rawKey = req.headers['idempotency-key'];
        if (!rawKey)
            return next();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawKey)) {
            next(new errors_1.ValidationError('Validation failed', {
                'idempotency-key': 'Idempotency-Key must be a valid UUID',
            }));
            return;
        }
        const key = redis_client_1.RedisKeys.httpIdempotency(req.auth.sub, rawKey);
        const cached = await (0, redis_client_1.redisGetJson)(key);
        if (cached) {
            for (const [name, value] of Object.entries(cached.headers)) {
                res.setHeader(name, value);
            }
            res.setHeader('Idempotent-Replayed', 'true');
            res.status(cached.status).json(cached.body);
            return;
        }
        const originalJson = res.json.bind(res);
        res.json = function (body) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const toStore = {
                    status: res.statusCode,
                    body,
                    headers: {
                        'Content-Type': res.getHeader('Content-Type') ?? 'application/json',
                    },
                };
                void (0, redis_client_1.redisSetJson)(key, toStore, redis_client_1.RedisTTL.httpIdempotency);
            }
            return originalJson(body);
        };
        next();
    };
}
//# sourceMappingURL=idempotency.middleware.js.map