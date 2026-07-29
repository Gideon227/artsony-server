"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shippingAddressService = void 0;
const shipping_address_repository_1 = require("../repositories/shipping-address.repository");
const errors_1 = require("../../../common/errors");
exports.shippingAddressService = {
    async list(userId) {
        return shipping_address_repository_1.shippingAddressRepository.listByUser(userId);
    },
    async get(id, userId) {
        const address = await shipping_address_repository_1.shippingAddressRepository.findById(id, userId);
        if (!address)
            throw new errors_1.NotFoundError('Shipping address');
        return address;
    },
    // ── create ─────────────────────────────────────────────────────────────────
    // A brand-new user's first saved address is always made the default,
    // regardless of what the client sent, so there's never a saved address
    // with nothing marked default. Subsequent inserts asking to be default
    // go through the atomic swap RPC instead of a plain insert, since a
    // plain insert with is_default = true would violate the one-default
    // unique index if a default already exists.
    async create(userId, input) {
        const existing = await shipping_address_repository_1.shippingAddressRepository.listByUser(userId);
        const isFirst = existing.length === 0;
        const created = await shipping_address_repository_1.shippingAddressRepository.create(userId, {
            ...input,
            is_default: isFirst ? true : false,
        });
        if (!isFirst && input.is_default) {
            const promoted = await shipping_address_repository_1.shippingAddressRepository.setDefault(created.id, userId);
            return promoted ?? created;
        }
        return created;
    },
    async update(id, userId, input) {
        const updated = await shipping_address_repository_1.shippingAddressRepository.update(id, userId, input);
        if (!updated)
            throw new errors_1.NotFoundError('Shipping address');
        return updated;
    },
    async setDefault(id, userId) {
        const updated = await shipping_address_repository_1.shippingAddressRepository.setDefault(id, userId);
        if (!updated)
            throw new errors_1.NotFoundError('Shipping address');
        return updated;
    },
    async remove(id, userId) {
        const deleted = await shipping_address_repository_1.shippingAddressRepository.delete(id, userId);
        if (!deleted)
            throw new errors_1.NotFoundError('Shipping address');
    },
};
//# sourceMappingURL=shipping-address.service.js.map