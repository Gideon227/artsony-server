import type { Request, Response, NextFunction } from 'express';
export declare const downloadRateLimit: import("express-rate-limit").RateLimitRequestHandler;
export declare const tokenParamValidation: import("express-validator").ValidationChain[];
export declare function handleRedeemToken(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetMyDownloads(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=delivery.controller.d.ts.map