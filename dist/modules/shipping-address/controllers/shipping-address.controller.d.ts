import type { Request, Response, NextFunction } from 'express';
export declare const createShippingAddressValidation: import("express-validator").ValidationChain[];
export declare const updateShippingAddressValidation: import("express-validator").ValidationChain[];
export declare const shippingAddressIdValidation: import("express-validator").ValidationChain[];
export declare function handleList(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGet(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleCreate(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleUpdate(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleSetDefault(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleDelete(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=shipping-address.controller.d.ts.map