import type { Request, Response, NextFunction } from 'express';
export declare const overviewValidation: import("express-validator").ValidationChain[];
export declare const dailyEarningsValidation: import("express-validator").ValidationChain[];
export declare const salesAnalyticsValidation: import("express-validator").ValidationChain[];
export declare const topArtworksValidation: import("express-validator").ValidationChain[];
export declare const scoreValidation: import("express-validator").ValidationChain[];
export declare const commentAnalyticsValidation: import("express-validator").ValidationChain[];
export declare function handleGetOverview(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetDailyEarnings(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetSalesAnalytics(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetTopArtworks(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetArtsonyScore(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetCommentAnalytics(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=analytics.controller.d.ts.map