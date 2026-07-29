"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const delivery_controller_1 = require("../controllers/delivery.controller");
const router = (0, express_1.Router)();
exports.deliveryRouter = router;
router.use(auth_middleware_1.requireAuth);
// Placed before /:token so Express does not match 'my-downloads' as a token
router.get('/my-downloads', delivery_controller_1.handleGetMyDownloads);
// Rate-limited token redemption endpoint
router.get('/:token', delivery_controller_1.downloadRateLimit, delivery_controller_1.tokenParamValidation, delivery_controller_1.handleRedeemToken);
//# sourceMappingURL=delivery.routes.js.map