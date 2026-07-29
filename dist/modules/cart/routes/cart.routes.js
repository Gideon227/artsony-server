"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cartRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const cart_controller_1 = require("../controllers/cart.controller");
const router = (0, express_1.Router)();
exports.cartRouter = router;
// All cart routes require authentication — a cart is always user-scoped.
// The apiRateLimit (100 req/min per user) is inherited from app-level
// middleware. No additional per-route limiter is needed here.
router.use(auth_middleware_1.requireAuth);
router.get('/', cart_controller_1.handleGetCart);
router.post('/items', cart_controller_1.addItemValidation, cart_controller_1.handleAddItem);
router.patch('/items/:id', cart_controller_1.updateItemValidation, cart_controller_1.handleUpdateItem);
router.delete('/items/:id', cart_controller_1.removeItemValidation, cart_controller_1.handleRemoveItem);
router.delete('/', cart_controller_1.handleClearCart);
//# sourceMappingURL=cart.routes.js.map