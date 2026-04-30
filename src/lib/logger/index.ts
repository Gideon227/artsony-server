import pino from 'pino';
import { config } from '@/config/index.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  // Use conditional spreading to avoid passing 'undefined'
  ...(config.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
  base: {
    env: config.NODE_ENV,
  },
});