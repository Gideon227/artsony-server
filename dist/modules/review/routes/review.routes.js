"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../../middleware/rate-limit.middleware");
const review_controller_1 = require("../controllers/review.controller");
const router = (0, express_1.Router)();
exports.reviewRouter = router;
router.use(rate_limit_middleware_1.apiRateLimit);
// Public — artwork detail pages show reviews without requiring login.
router.get('/artwork/:artworkId', review_controller_1.listReviewsValidation, review_controller_1.handleListForArtwork);
// Authenticated — buyer eligibility, buyer create, seller's own dashboard feed.
router.get('/order-item/:orderItemId/eligibility', auth_middleware_1.requireAuth, review_controller_1.handleCanReview);
router.post('/', auth_middleware_1.requireAuth, review_controller_1.createReviewValidation, review_controller_1.handleCreateReview);
router.get('/me/received', auth_middleware_1.requireAuth, review_controller_1.listReviewsValidation, review_controller_1.handleListForSeller);
//# sourceMappingURL=review.routes.js.map