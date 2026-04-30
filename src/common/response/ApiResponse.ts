import type { Response } from 'express';

export interface PaginationMeta {
  total?: number;
  page?: number;
  limit?: number;
  hasMore: boolean;
  nextCursor?: string | null;
}

interface SuccessPayload<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

interface ErrorPayload {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export const ApiResponse = {
  ok<T>(res: Response, data: T, meta?: PaginationMeta): Response {
    const payload: SuccessPayload<T> = { success: true, data, ...(meta && { meta }) };
    return res.status(200).json(payload);
  },

  created<T>(res: Response, data: T): Response {
    const payload: SuccessPayload<T> = { success: true, data };
    return res.status(201).json(payload);
  },

  noContent(res: Response): Response {
    return res.status(204).send();
  },

  error(
    res: Response,
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ): Response {
    const payload: ErrorPayload = {
      success: false,
      error: { code, message, ...(details && { details }) },
    };
    return res.status(statusCode).json(payload);
  },
};