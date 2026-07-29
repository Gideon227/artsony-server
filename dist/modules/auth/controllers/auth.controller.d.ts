import type { Request, Response, NextFunction } from 'express';
export declare const registerValidation: import("express-validator").ValidationChain[];
export declare const loginValidation: import("express-validator").ValidationChain[];
export declare const forgotPasswordValidation: import("express-validator").ValidationChain[];
export declare const resetPasswordValidation: import("express-validator").ValidationChain[];
export declare function handleRegister(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleLogin(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleRefresh(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleLogout(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleForgotPassword(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleResetPassword(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleDeleteAccount(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleMe(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleOAuthCallback(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=auth.controller.d.ts.map