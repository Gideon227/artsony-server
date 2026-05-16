export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly isOperational = true
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN')
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND')
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT')
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fields?: Record<string, string>
  ) {
    super(message, 422, 'VALIDATION_ERROR')
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMITED')
  }
}

export class AccountLockedError extends AppError {
  constructor(public readonly lockedUntil: Date) {
    super('Account temporarily locked due to too many failed attempts', 423, 'ACCOUNT_LOCKED')
  }
}

export class TokenExpiredError extends AppError {
  constructor() {
    super('Token has expired', 401, 'TOKEN_EXPIRED')
  }
}

export class InvalidTokenError extends AppError {
  constructor() {
    super('Invalid or revoked token', 401, 'INVALID_TOKEN')
  }
}
