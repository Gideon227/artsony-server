"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
exports.extractRequestContext = extractRequestContext;
const errors_1 = require("../common/errors");
// ─── Global error handler ─────────────────────────────────────────────────────
function errorHandler(err, req, res, _next) {
    if (err instanceof errors_1.AppError) {
        res.status(err.statusCode).json({
            success: false,
            code: err.code,
            message: err.message,
            ...(err.statusCode === 422 && 'fields' in err
                ? { fields: err.fields }
                : {}),
        });
        return;
    }
    // Unknown error — log and return generic 500
    console.error('[UnhandledError]', err);
    res.status(500).json({
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
    });
}
// ─── Not found handler ────────────────────────────────────────────────────────
function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`,
    });
}
// ─── Request context extractor ────────────────────────────────────────────────
function extractRequestContext(req) {
    // Trust X-Forwarded-For only if behind a trusted proxy
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ??
        req.socket.remoteAddress ??
        null;
    return {
        ipAddress: ip,
        userAgent: req.headers['user-agent'] ?? null,
    };
}
//# sourceMappingURL=error.middleware.js.map