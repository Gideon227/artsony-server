"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commentRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../../middleware/rate-limit.middleware");
const comment_controller_1 = require("../controllers/comment.controller");
const router = (0, express_1.Router)();
exports.commentRouter = router;
router.use(rate_limit_middleware_1.apiRateLimit);
// Public — anyone can read comments on an artwork.
router.get('/artwork/:artworkId', comment_controller_1.listCommentsValidation, comment_controller_1.handleListComments);
router.get('/:commentId/replies', comment_controller_1.listRepliesValidation, comment_controller_1.handleListReplies);
// Authenticated
router.post('/', auth_middleware_1.requireAuth, comment_controller_1.createCommentValidation, comment_controller_1.handleCreateComment);
router.delete('/:commentId', auth_middleware_1.requireAuth, comment_controller_1.deleteCommentValidation, comment_controller_1.handleDeleteComment);
//# sourceMappingURL=comment.route.js.map