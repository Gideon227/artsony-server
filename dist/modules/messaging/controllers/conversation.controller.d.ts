import type { Request, Response, NextFunction } from 'express';
export declare const createConversationValidation: import("express-validator").ValidationChain[];
export declare const updateConversationValidation: import("express-validator").ValidationChain[];
export declare const listConversationsValidation: import("express-validator").ValidationChain[];
export declare const searchConversationsValidation: import("express-validator").ValidationChain[];
export declare function handleCreateConversation(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleListConversations(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleSearchConversations(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetConversation(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleUpdateConversation(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleMuteConversation(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleLeaveConversation(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=conversation.controller.d.ts.map