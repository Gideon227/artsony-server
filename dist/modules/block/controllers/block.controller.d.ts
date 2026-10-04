import type { Request, Response, NextFunction } from 'express';
export declare const blockUserValidation: import("express-validator").ValidationChain[];
export declare const listBlockedValidation: import("express-validator").ValidationChain[];
export declare function handleBlockUser(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleUnblockUser(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleListBlocked(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=block.controller.d.ts.map