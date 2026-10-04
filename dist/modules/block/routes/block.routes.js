"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blockRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../../middleware/rate-limit.middleware");
const block_controller_1 = require("../controllers/block.controller");
const router = (0, express_1.Router)();
exports.blockRouter = router;
router.use(auth_middleware_1.requireAuth);
router.use(rate_limit_middleware_1.apiRateLimit);
router.get('/', block_controller_1.listBlockedValidation, block_controller_1.handleListBlocked);
router.post('/:userId', block_controller_1.blockUserValidation, block_controller_1.handleBlockUser);
router.delete('/:userId', block_controller_1.blockUserValidation, block_controller_1.handleUnblockUser);
//# sourceMappingURL=block.routes.js.map