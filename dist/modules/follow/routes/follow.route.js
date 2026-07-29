"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.followRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../../middleware/rate-limit.middleware");
const follow_controller_1 = require("../controllers/follow.controller");
const router = (0, express_1.Router)();
exports.followRouter = router;
router.use(rate_limit_middleware_1.apiRateLimit);
// Public — anyone can see who follows / is followed by a user.
router.get('/:userId/followers', follow_controller_1.listFollowValidation, follow_controller_1.handleListFollowers);
router.get('/:userId/following', follow_controller_1.listFollowValidation, follow_controller_1.handleListFollowing);
// Authenticated
router.get('/:userId/is-following', auth_middleware_1.requireAuth, follow_controller_1.toggleFollowValidation, follow_controller_1.handleIsFollowing);
router.post('/:userId/toggle', auth_middleware_1.requireAuth, follow_controller_1.toggleFollowValidation, follow_controller_1.handleToggleFollow);
//# sourceMappingURL=follow.route.js.map