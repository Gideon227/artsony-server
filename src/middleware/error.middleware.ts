import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

import { AppError } from '../common/errors/AppError.js';
import { ApiResponse } from '../common/response/ApiResponse.js';
import { config } from '../config/index.js';
import { logger } from '../lib/logger/index.js';

export const errorMiddleware = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): Response => {
  if (err instanceof ZodError) {
    return ApiResponse.error(
      res,
      422,
      'VALIDATION_ERROR',
      'Request validation failed',
      err.flatten().fieldErrors,
    );
  }

  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err, req: { method: req.method, url: req.url } }, 'Unexpected error');
    }

    return ApiResponse.error(res, err.statusCode, err.code, err.message, err.details);
  }

  // Unexpected/unhandled errors
  logger.error({ err, req: { method: req.method, url: req.url } }, 'Unhandled error');

  const message = config.NODE_ENV === 'production' ? 'Internal server error' : String(err);
  return ApiResponse.error(res, 500, 'INTERNAL_ERROR', message);
};