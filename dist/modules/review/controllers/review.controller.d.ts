import type { Request, Response, NextFunction } from 'express';
export declare const createReviewValidation: import("express-validator").ValidationChain[];
export declare const listReviewsValidation: import("express-validator").ValidationChain[];
export declare function handleCanReview(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleCreateReview(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleListForArtwork(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleListForSeller(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=review.controller.d.ts.map