export declare class AppError extends Error {
    readonly message: string;
    readonly statusCode: number;
    readonly code: string;
    readonly isOperational: boolean;
    constructor(message: string, statusCode: number, code: string, isOperational?: boolean);
}
export declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
export declare class ForbiddenError extends AppError {
    constructor(message?: string);
}
export declare class NotFoundError extends AppError {
    constructor(resource?: string);
}
export declare class ConflictError extends AppError {
    constructor(message: string);
}
export declare class ValidationError extends AppError {
    readonly fields?: Record<string, string> | undefined;
    constructor(message: string, fields?: Record<string, string> | undefined);
}
export declare class TooManyRequestsError extends AppError {
    constructor(message?: string);
}
export declare class AccountLockedError extends AppError {
    readonly lockedUntil: Date;
    constructor(lockedUntil: Date);
}
export declare class TokenExpiredError extends AppError {
    constructor();
}
export declare class InvalidTokenError extends AppError {
    constructor();
}
//# sourceMappingURL=index.d.ts.map