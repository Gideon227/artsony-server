"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../../middleware/rate-limit.middleware");
const notification_controller_1 = require("../controllers/notification.controller");
const router = (0, express_1.Router)();
exports.notificationRouter = router;
router.use(auth_middleware_1.requireAuth);
router.use(rate_limit_middleware_1.apiRateLimit);
// GET  /api/notifications
router.get('/', notification_controller_1.listNotificationsValidation, notification_controller_1.handleListNotifications);
// GET  /api/notifications/unread-count
// Must be registered before /:id to avoid param collision
router.get('/unread-count', notification_controller_1.handleGetUnreadCount);
// POST /api/notifications/read-all
router.post('/read-all', notification_controller_1.handleMarkAllRead);
// POST /api/notifications/:id/read
router.post('/:id/read', notification_controller_1.markReadValidation, notification_controller_1.handleMarkRead);
//# sourceMappingURL=notification.router.js.map