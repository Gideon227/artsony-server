"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shippingAddressRepository = void 0;
const database_1 = require("../../../config/database");
// ── Row → Domain mapper ────────────────────────────────────────────────────────
function toShippingAddress(row) {
    return {
        id: row['id'],
        user_id: row['user_id'],
        label: row['label'] ?? null,
        full_name: row['full_name'],
        phone: row['phone'],
        address_line_1: row['address_line_1'],
        address_line_2: row['address_line_2'] ?? null,
        city: row['city'],
        state: row['state'],
        postal_code: row['postal_code'],
        country_code: row['country_code'],
        is_default: row['is_default'],
        created_at: new Date(row['created_at']),
        updated_at: new Date(row['updated_at']),
    };
}
exports.shippingAddressRepository = {
    // ── ListByUser ───────────────────────────────────────────────────────────────
    async listByUser(userId) {
        const result = await (0, database_1.supabase)()
            .from('shipping_addresses')
            .select('*')
            .eq('user_id', userId)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false });
        (0, database_1.assertNoErrorMany)(result, 'shippingAddress.listByUser');
        return (result.data ?? []).map(toShippingAddress);
    },
    // ── FindById ─────────────────────────────────────────────────────────────────
    // Scoped to user_id so callers get NotFound rather than leaking existence
    // of another user's address.
    async findById(id, userId) {
        const result = await (0, database_1.supabase)()
            .from('shipping_addresses')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'shippingAddress.findById');
        return toShippingAddress(result.data);
    },
    // ── Create ───────────────────────────────────────────────────────────────────
    // If this is the user's first address, or the caller explicitly asked for
    // it, is_default is honored as-is; the unique partial index on
    // shipping_addresses guarantees at most one default, so a plain insert
    // with is_default = true will fail with 23505 if one already exists.
    // The service layer routes that case through set_default_shipping_address
    // instead when the caller wants to switch defaults.
    async create(userId, input) {
        const result = await (0, database_1.supabase)()
            .from('shipping_addresses')
            .insert({
            user_id: userId,
            label: input.label ?? null,
            full_name: input.full_name,
            phone: input.phone,
            address_line_1: input.address_line_1,
            address_line_2: input.address_line_2 ?? null,
            city: input.city,
            state: input.state,
            postal_code: input.postal_code,
            country_code: input.country_code,
            is_default: input.is_default,
        })
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'shippingAddress.create');
        return toShippingAddress(result.data);
    },
    // ── Update ───────────────────────────────────────────────────────────────────
    // Field-level update, scoped to owner. Does not touch is_default — that's
    // exclusively handled by setDefault to preserve the one-default invariant.
    async update(id, userId, input) {
        const payload = { updated_at: new Date().toISOString() };
        if (input.label !== undefined)
            payload['label'] = input.label;
        if (input.full_name !== undefined)
            payload['full_name'] = input.full_name;
        if (input.phone !== undefined)
            payload['phone'] = input.phone;
        if (input.address_line_1 !== undefined)
            payload['address_line_1'] = input.address_line_1;
        if (input.address_line_2 !== undefined)
            payload['address_line_2'] = input.address_line_2;
        if (input.city !== undefined)
            payload['city'] = input.city;
        if (input.state !== undefined)
            payload['state'] = input.state;
        if (input.postal_code !== undefined)
            payload['postal_code'] = input.postal_code;
        if (input.country_code !== undefined)
            payload['country_code'] = input.country_code;
        const result = await (0, database_1.supabase)()
            .from('shipping_addresses')
            .update(payload)
            .eq('id', id)
            .eq('user_id', userId)
            .select('*')
            .maybeSingle();
        if (result.error) {
            throw new Error(`[Supabase:shippingAddress.update] ${result.error.message}`);
        }
        return result.data ? toShippingAddress(result.data) : undefined;
    },
    // ── SetDefault ───────────────────────────────────────────────────────────────
    // Atomic swap via RPC — see set_default_shipping_address in
    // 20240801000000_checkout_atomicity.sql. Clears the previous default and
    // sets the new one inside a single function call so a crash mid-swap can
    // never leave the user with zero or two defaults.
    async setDefault(id, userId) {
        const result = await (0, database_1.supabase)().rpc('set_default_shipping_address', {
            p_user_id: userId,
            p_address_id: id,
        });
        if (result.error) {
            if (result.error.code === 'P0002')
                return undefined;
            throw Object.assign(new Error(`[Supabase:shippingAddress.setDefault] ${result.error.message}`), { code: result.error.code });
        }
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        return row ? toShippingAddress(row) : undefined;
    },
    // ── Delete ───────────────────────────────────────────────────────────────────
    async delete(id, userId) {
        const result = await (0, database_1.supabase)()
            .from('shipping_addresses')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
            .select('id')
            .maybeSingle();
        if (result.error) {
            throw new Error(`[Supabase:shippingAddress.delete] ${result.error.message}`);
        }
        return result.data !== null;
    },
};
//# sourceMappingURL=shipping-address.repository.js.map