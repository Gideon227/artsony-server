"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markReadValidation = exports.listNotificationsValidation = void 0;
exports.handleListNotifications = handleListNotifications;
exports.handleGetUnreadCount = handleGetUnreadCount;
exports.handleMarkRead = handleMarkRead;
exports.handleMarkAllRead = handleMarkAllRead;
const express_validator_1 = require("express-validator");
const notification_service_1 = require("../services/notification.service");
const errors_1 = require("../../../common/errors");
// ── Validation chains ────────────────────────────────────────────────────────
exports.listNotificationsValidation = [
    (0, express_validator_1.query)('cursor')
        .optional()
        .isISO8601()
        .withMessage('cursor must be a valid ISO 8601 date string'),
    (0, express_validator_1.query)('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .toInt(),
    (0, express_validator_1.query)('unread_only')
        .optional()
        .isBoolean()
        .toBoolean()
        .withMessage('unread_only must be a boolean'),
];
exports.markReadValidation = [
    (0, express_validator_1.param)('id')
        .isUUID()
        .withMessage('Notification id must be a valid UUID'),
];
// ── Handler helper ───────────────────────────────────────────────────────────
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
// ── Handlers ─────────────────────────────────────────────────────────────────
// GET /api/notifications
async function handleListNotifications(req, res, next) {
    try {
        assertValid(req);
        const userId = req.auth.sub;
        // FIX: Cast via unknown to bypass ParsedQs type restrictions safely
        const { cursor, limit, unread_only } = req.query;
        const page = await notification_service_1.notificationService.list({
            userId,
            // FIX: Conditional spreading to satisfy exactOptionalPropertyTypes
            ...(cursor !== undefined ? { cursor } : {}),
            ...(limit !== undefined ? { limit } : {}),
            ...(unread_only !== undefined ? { unreadOnly: unread_only } : {}),
        });
        res.json({ success: true, data: page });
    }
    catch (err) {
        next(err);
    }
}
// GET /api/notifications/unread-count
async function handleGetUnreadCount(req, res, next) {
    try {
        const userId = req.auth.sub;
        const count = await notification_service_1.notificationService.getUnreadCount(userId);
        res.json({ success: true, data: { unread_count: count } });
    }
    catch (err) {
        next(err);
    }
}
// POST /api/notifications/:id/read
async function handleMarkRead(req, res, next) {
    try {
        assertValid(req);
        const userId = req.auth.sub;
        const notificationId = req.params['id'];
        await notification_service_1.notificationService.markRead(notificationId, userId);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
}
// POST /api/notifications/read-all
async function handleMarkAllRead(req, res, next) {
    try {
        const userId = req.auth.sub;
        await notification_service_1.notificationService.markAllRead(userId);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=notification.controller.js.map