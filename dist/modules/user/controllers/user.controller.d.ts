import type { Request, Response, NextFunction } from 'express';
export declare const onboardingValidation: import("express-validator").ValidationChain[];
export declare const updateProfileValidation: import("express-validator").ValidationChain[];
export declare function handleCompleteOnboarding(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleUpdateProfile(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare const updatePrivacySettingsValidation: import("express-validator").ValidationChain[];
export declare function handleGetPrivacySettings(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleUpdatePrivacySettings(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare const getInteractionPermissionsValidation: import("express-validator").ValidationChain[];
export declare function handleGetInteractionPermissions(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetMe(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare const getPublicProfileValidation: import("express-validator").ValidationChain[];
export declare function handleGetPublicProfile(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleSearchUsers(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetUsersByIds(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=user.controller.d.ts.map