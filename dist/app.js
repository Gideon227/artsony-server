"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const morgan_1 = __importDefault(require("morgan"));
const hpp_1 = __importDefault(require("hpp"));
const express_mongo_sanitize_1 = __importDefault(require("express-mongo-sanitize"));
const path_1 = __importDefault(require("path"));
// Modules
const auth_router_1 = require("./modules/auth/auth.router");
const user_router_1 = require("./modules/user/user.router");
const seller_routes_1 = require("./modules/seller/routes/seller.routes");
const artwork_routes_1 = require("./modules/artwork/routes/artwork.routes");
const cart_routes_1 = require("./modules/cart/routes/cart.routes");
const order_routes_1 = require("./modules/order/routes/order.routes");
const delivery_routes_1 = require("./modules/delivery/routes/delivery.routes");
const upload_routes_1 = require("./modules/upload/routes/upload.routes");
const messaging_router_1 = require("./modules/messaging/routes/messaging.router");
const notification_router_1 = require("./modules/messaging/routes/notification.router");
const physical_order_routes_1 = require("./modules/order/routes/physical-order.routes");
const shipping_address_routes_1 = require("./modules/shipping-address/routes/shipping-address.routes");
const wallet_routes_1 = require("./modules/wallet/routes/wallet.routes");
const review_routes_1 = require("./modules/review/routes/review.routes");
const analytics_routes_1 = require("./modules/analytics/routes/analytics.routes");
const follow_route_1 = require("./modules/follow/routes/follow.route");
const comment_route_1 = require("./modules/comments/routes/comment.route");
// Middleware & Config
const error_middleware_1 = require("./middleware/error.middleware");
const rate_limit_middleware_1 = require("./middleware/rate-limit.middleware");
const config_1 = require("./config");
function createApp() {
    const app = (0, express_1.default)();
    // ── Security headers ───────────────────────────────────────────────────────
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'", 'wss:'], // wss: required for WebSocket upgrade
                frameSrc: ["'none'"],
                objectSrc: ["'none'"],
            },
        },
        hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
        noSniff: true,
        xssFilter: true,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }));
    // ── CORS ───────────────────────────────────────────────────────────────────
    app.use((0, cors_1.default)({
        origin: (origin, cb) => {
            if (!origin || origin === config_1.config.app.frontendUrl)
                return cb(null, true);
            cb(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
        maxAge: 86_400,
    }));
    // ── Body parsing ───────────────────────────────────────────────────────────
    app.use(express_1.default.json({ limit: '10kb' })); // Limit body size — prevent DoS
    app.use(express_1.default.urlencoded({ extended: true, limit: '10kb' }));
    app.use((0, cookie_parser_1.default)());
    // ── Request sanitisation ───────────────────────────────────────────────────
    app.use((0, express_mongo_sanitize_1.default)()); // Prevent NoSQL injection via $ operators
    app.use((0, hpp_1.default)()); // Prevent HTTP parameter pollution
    // ── Logging ────────────────────────────────────────────────────────────────
    if (config_1.config.env !== 'test') {
        app.use((0, morgan_1.default)(config_1.config.env === 'production' ? 'combined' : 'dev'));
    }
    // ── Trust proxy (Nginx / load balancer) ────────────────────────────────────
    app.set('trust proxy', 1);
    // ── Health ─────────────────────────────────────────────────────────────────
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', ts: new Date().toISOString() });
    });
    // ── Static Files ───────────────────────────────────────────────────────────
    app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'public', 'uploads')));
    // ── Routes ─────────────────────────────────────────────────────────────────
    app.use('/api', rate_limit_middleware_1.apiRateLimit); // Applies rate limiting to all /api routes defined below
    app.use('/api/auth', auth_router_1.authRouter);
    app.use('/api/users', user_router_1.userRouter);
    app.use('/api/seller-registrations', seller_routes_1.sellerRouter);
    app.use('/api/artworks', artwork_routes_1.artworkRouter);
    app.use('/api/cart', cart_routes_1.cartRouter);
    app.use('/api/orders', order_routes_1.orderRouter);
    app.use('/api/delivery', delivery_routes_1.deliveryRouter);
    app.use('/api/upload', upload_routes_1.uploadRouter);
    app.use('/api/conversations', messaging_router_1.messagingRouter);
    app.use('/api/notifications', notification_router_1.notificationRouter);
    app.use('/api/physical-orders', physical_order_routes_1.physicalOrderRouter);
    app.use('/api/shipping-addresses', shipping_address_routes_1.shippingAddressRouter);
    app.use('/api/wallet', wallet_routes_1.walletRouter);
    app.use('/api/reviews', review_routes_1.reviewRouter);
    app.use('/api/analytics', analytics_routes_1.analyticsRouter);
    app.use('/api/follows', follow_route_1.followRouter);
    app.use('/api/comments', comment_route_1.commentRouter);
    // Note: In any specific router that needs onboarding protection, import and use:
    // router.use(requireAuth, requireOnboarded)
    // ── Fallthrough ────────────────────────────────────────────────────────────
    app.use(error_middleware_1.notFoundHandler);
    app.use(error_middleware_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map