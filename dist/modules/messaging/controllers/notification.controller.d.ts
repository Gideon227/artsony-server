import type { Request, Response, NextFunction } from 'express';
export declare const listNotificationsValidation: import("express-validator").ValidationChain[];
export declare const markReadValidation: import("express-validator").ValidationChain[];
export declare function handleListNotifications(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleMarkRead(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleMarkAllRead(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=notification.controller.d.ts.map