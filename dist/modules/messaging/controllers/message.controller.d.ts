import type { Request, Response, NextFunction } from 'express';
export declare const sendMessageValidation: import("express-validator").ValidationChain[];
export declare const editMessageValidation: import("express-validator").ValidationChain[];
export declare const listMessagesValidation: import("express-validator").ValidationChain[];
export declare const searchMessagesValidation: import("express-validator").ValidationChain[];
export declare const markReadValidation: import("express-validator").ValidationChain[];
export declare function handleListMessages(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleSearchMessages(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleSendMessage(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleEditMessage(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleDeleteMessage(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleMarkRead(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetReadReceipts(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=message.controller.d.ts.map