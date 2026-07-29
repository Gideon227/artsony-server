import type { Request, Response, NextFunction } from 'express';
export declare const checkoutValidation: import("express-validator").ValidationChain[];
export declare const confirmPaymentValidation: import("express-validator").ValidationChain[];
export declare const orderIdValidation: import("express-validator").ValidationChain[];
export declare const updateStatusValidation: import("express-validator").ValidationChain[];
export declare const orderListValidation: import("express-validator").ValidationChain[];
export declare function handleCheckout(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetBuyerOrders(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetSellerOrders(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetOrder(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleConfirmPayment(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleCancelOrder(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleUpdateStatus(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=order.controller.d.ts.map