import Redis from 'ioredis';

import { config } from './index.js';
import { logger } from '../lib/logger/index.js';

const createRedisClient = (): Redis => {
  const client = new Redis(config.REDIS_URL, {
    password: config.REDIS_PASSWORD ?? undefined,
    tls: config.REDIS_TLS ? {} : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 10) return null;
      return Math.min(times * 100, 3000);
    },
    lazyConnect: true,
  });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('error', (err) => logger.error({ err }, 'Redis error'));
  client.on('reconnecting', () => logger.warn('Redis reconnecting'));

  return client;
};

export const redis = createRedisClient();

export const connectRedis = async (): Promise<void> => {
  await redis.connect();
};