import { pinoHttp } from 'pino-http';

import { logger } from '../lib/logger/index.js';

export const requestLogger = pinoHttp({
  logger,
  customLogLevel: (_req, res) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});