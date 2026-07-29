import type { Request, Response, NextFunction } from 'express';
export declare function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void;
export declare function notFoundHandler(req: Request, res: Response): void;
export declare function extractRequestContext(req: Request): {
    ipAddress: string | null;
    userAgent: string | null;
};
//# sourceMappingURL=error.middleware.d.ts.map