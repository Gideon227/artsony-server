"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidTokenError = exports.TokenExpiredError = exports.AccountLockedError = exports.TooManyRequestsError = exports.ValidationError = exports.ConflictError = exports.NotFoundError = exports.ForbiddenError = exports.UnauthorizedError = exports.AppError = void 0;
class AppError extends Error {
    message;
    statusCode;
    code;
    isOperational;
    constructor(message, statusCode, code, isOperational = true) {
        super(message);
        this.message = message;
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = isOperational;
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 401, 'UNAUTHORIZED');
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 403, 'FORBIDDEN');
    }
}
exports.ForbiddenError = ForbiddenError;
class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404, 'NOT_FOUND');
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
    constructor(message) {
        super(message, 409, 'CONFLICT');
    }
}
exports.ConflictError = ConflictError;
class ValidationError extends AppError {
    fields;
    constructor(message, fields) {
        super(message, 422, 'VALIDATION_ERROR');
        this.fields = fields;
    }
}
exports.ValidationError = ValidationError;
class TooManyRequestsError extends AppError {
    constructor(message = 'Too many requests') {
        super(message, 429, 'RATE_LIMITED');
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
class AccountLockedError extends AppError {
    lockedUntil;
    constructor(lockedUntil) {
        super('Account temporarily locked due to too many failed attempts', 423, 'ACCOUNT_LOCKED');
        this.lockedUntil = lockedUntil;
    }
}
exports.AccountLockedError = AccountLockedError;
class TokenExpiredError extends AppError {
    constructor() {
        super('Token has expired', 401, 'TOKEN_EXPIRED');
    }
}
exports.TokenExpiredError = TokenExpiredError;
class InvalidTokenError extends AppError {
    constructor() {
        super('Invalid or revoked token', 401, 'INVALID_TOKEN');
    }
}
exports.InvalidTokenError = InvalidTokenError;
//# sourceMappingURL=index.js.map