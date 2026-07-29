import type { Request, Response, NextFunction } from 'express';
export declare const requestWithdrawalValidation: import("express-validator").ValidationChain[];
export declare const listLedgerValidation: import("express-validator").ValidationChain[];
export declare const transitionWithdrawalValidation: import("express-validator").ValidationChain[];
export declare function handleGetBalance(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleListLedger(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleRequestWithdrawal(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleListMyWithdrawals(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleCancelMyWithdrawal(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleAdminListWithdrawals(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleAdminTransitionWithdrawal(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleAdminGetArtistBalance(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=wallet.controller.d.ts.map