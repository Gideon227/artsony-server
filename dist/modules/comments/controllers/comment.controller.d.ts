import type { Request, Response, NextFunction } from 'express';
export declare const createCommentValidation: import("express-validator").ValidationChain[];
export declare const listCommentsValidation: import("express-validator").ValidationChain[];
export declare const listRepliesValidation: import("express-validator").ValidationChain[];
export declare const deleteCommentValidation: import("express-validator").ValidationChain[];
export declare function handleCreateComment(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleListComments(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleListReplies(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleDeleteComment(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=comment.controller.d.ts.map