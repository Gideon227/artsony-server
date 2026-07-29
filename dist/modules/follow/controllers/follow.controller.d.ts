import type { Request, Response, NextFunction } from 'express';
export declare const toggleFollowValidation: import("express-validator").ValidationChain[];
export declare const listFollowValidation: import("express-validator").ValidationChain[];
export declare function handleToggleFollow(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleIsFollowing(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleListFollowers(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleListFollowing(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=follow.controller.d.ts.map