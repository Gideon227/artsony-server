"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shippingAddressRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const shipping_address_controller_1 = require("../controllers/shipping-address.controller");
const router = (0, express_1.Router)();
exports.shippingAddressRouter = router;
// A saved address is always user-scoped.
router.use(auth_middleware_1.requireAuth);
router.get('/', shipping_address_controller_1.handleList);
router.post('/', shipping_address_controller_1.createShippingAddressValidation, shipping_address_controller_1.handleCreate);
router.get('/:id', shipping_address_controller_1.shippingAddressIdValidation, shipping_address_controller_1.handleGet);
router.patch('/:id', shipping_address_controller_1.updateShippingAddressValidation, shipping_address_controller_1.handleUpdate);
router.post('/:id/default', shipping_address_controller_1.shippingAddressIdValidation, shipping_address_controller_1.handleSetDefault);
router.delete('/:id', shipping_address_controller_1.shippingAddressIdValidation, shipping_address_controller_1.handleDelete);
//# sourceMappingURL=shipping-address.routes.js.map