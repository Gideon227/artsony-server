"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../../middleware/rate-limit.middleware");
const analytics_controller_1 = require("../controllers/analytics.controller");
const router = (0, express_1.Router)();
exports.analyticsRouter = router;
// Artists view their own dashboard; admins may pass ?artist_id= for support
// (enforced in the controller's resolveSellerId, not here, since the query
// param isn't available to a route-level role gate).
router.use(auth_middleware_1.requireAuth);
router.use((0, auth_middleware_1.authorize)(['ARTIST', 'ADMIN']));
router.use(rate_limit_middleware_1.apiRateLimit);
router.get('/overview', analytics_controller_1.overviewValidation, analytics_controller_1.handleGetOverview);
router.get('/earnings/daily', analytics_controller_1.dailyEarningsValidation, analytics_controller_1.handleGetDailyEarnings);
router.get('/sales', analytics_controller_1.salesAnalyticsValidation, analytics_controller_1.handleGetSalesAnalytics);
router.get('/top-artworks', analytics_controller_1.topArtworksValidation, analytics_controller_1.handleGetTopArtworks);
router.get('/score', analytics_controller_1.scoreValidation, analytics_controller_1.handleGetArtsonyScore);
router.get('/reviews', analytics_controller_1.commentAnalyticsValidation, analytics_controller_1.handleGetCommentAnalytics);
//# sourceMappingURL=analytics.routes.js.map