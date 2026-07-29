import type { Request, Response, NextFunction } from 'express';
import type { UserRole, AccessTokenPayload } from '../common/types';
declare global {
    namespace Express {
        interface Request {
            auth?: AccessTokenPayload;
        }
    }
}
export declare function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function authorize(roles: UserRole[]): (req: Request, _res: Response, next: NextFunction) => void;
export declare function requireOnboarded(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=auth.middleware.d.ts.map