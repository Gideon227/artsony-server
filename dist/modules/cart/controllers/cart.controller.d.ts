import type { Request, Response, NextFunction } from 'express';
export declare const addItemValidation: import("express-validator").ValidationChain[];
export declare const updateItemValidation: import("express-validator").ValidationChain[];
export declare const removeItemValidation: import("express-validator").ValidationChain[];
export declare function handleGetCart(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleAddItem(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleUpdateItem(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleRemoveItem(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleClearCart(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=cart.controller.d.ts.map