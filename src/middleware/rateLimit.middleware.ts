import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

import { config } from '../config/index.js';
import { redis } from '../config/redis.js';

const redisStore = new RedisStore({
  sendCommand: async (...args: string[]) => redis.call(...args) as Promise<unknown>,
});

export const globalRateLimit = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: redisStore,
  keyGenerator: (req) => req.ip ?? 'unknown',
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: redisStore,
  keyGenerator: (req) => `auth:${req.ip ?? 'unknown'}`,
  message: {
    success: false,
    error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many authentication attempts' },
  },
  skipSuccessfulRequests: true,
});

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  store: redisStore,
  keyGenerator: (req) => `upload:${req.user?.sub ?? req.ip ?? 'unknown'}`,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Upload limit reached, try again later' },
  },
});