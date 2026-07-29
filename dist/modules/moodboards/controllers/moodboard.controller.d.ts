import type { Request, Response, NextFunction } from 'express';
export declare const createMoodboardValidation: import("express-validator").ValidationChain[];
export declare const updateMoodboardValidation: import("express-validator").ValidationChain[];
export declare const artworkJunctionValidation: import("express-validator").ValidationChain[];
export declare function handleCreateMoodboard(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleListMoodboards(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleUpdateMoodboard(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleDeleteMoodboard(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleAddArtwork(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleRemoveArtwork(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function handleGetMoodboard(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=moodboard.controller.d.ts.map