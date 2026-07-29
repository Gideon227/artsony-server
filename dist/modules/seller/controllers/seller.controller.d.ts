import type { Request, Response, NextFunction } from 'express';
export declare const submitRegistrationValidation: import("express-validator").ValidationChain[];
export declare const updateRegistrationValidation: import("express-validator").ValidationChain[];
export declare const idParamValidation: import("express-validator").ValidationChain[];
export declare const reviewNotesValidation: import("express-validator").ValidationChain[];
export declare const listFiltersValidation: import("express-validator").ValidationChain[];
export declare function handleSubmitRegistration(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetMyRegistration(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleUpdateMyRegistration(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleAdminList(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleAdminGetById(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare const handleApprove: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const handleReject: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const handleSuspend: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const handleReactivate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=seller.controller.d.ts.map