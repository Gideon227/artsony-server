"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellerRepository = void 0;
const database_1 = require("../../../config/database");
/**
 * Maps database rows (with ISO strings) to domain SellerRegistration objects.
 * Using 'any' for the row here mirrors user.repository.ts / session.repository.ts,
 * which avoids "neither type sufficiently overlaps" errors on Supabase's
 * nullable result.data.
 */
function toSellerRegistration(row) {
    return {
        ...row,
        ['created_at']: new Date(row['created_at']),
        ['updated_at']: new Date(row['updated_at']),
    };
}
exports.sellerRepository = {
    async findByUserId(userId) {
        const result = await (0, database_1.supabase)()
            .from('seller_registrations')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'seller.findByUserId');
        return toSellerRegistration(result.data);
    },
    async findById(id) {
        const result = await (0, database_1.supabase)()
            .from('seller_registrations')
            .select('*')
            .eq('id', id)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'seller.findById');
        return toSellerRegistration(result.data);
    },
    async list(filters) {
        const page = Math.max(1, filters.page ?? 1);
        const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        let query = (0, database_1.supabase)()
            .from('seller_registrations')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);
        if (filters.status)
            query = query.eq('status', filters.status);
        const result = await query;
        if (result.error) {
            throw new Error(`[Supabase:seller.list] ${result.error.message}`);
        }
        const total = result.count ?? 0;
        const total_pages = Math.ceil(total / limit);
        return {
            data: (result.data ?? []).map(toSellerRegistration),
            total,
            page,
            limit,
            total_pages,
            has_next: page < total_pages,
            has_prev: page > 1,
        };
    },
    // Atomic insert-or-resubmit via RPC — see submit_seller_registration() in
    // 20240701000000_seller_registration_schema.sql. Guarantees the
    // one-row-per-user invariant under concurrent submissions and handles
    // resubmission (REJECTED -> PENDING) as an update of the same row.
    // Throws a plain Error with a `.code` property preserved from Postgres so
    // the service layer can detect a 23505 conflict and translate it into a
    // ConflictError (repositories in this codebase never throw domain errors
    // directly — see user.repository.ts / session.repository.ts).
    async submit(userId, input) {
        const result = await (0, database_1.supabase)().rpc('submit_seller_registration', {
            ['p_user_id']: userId,
            ['p_full_name']: input.full_name,
            ['p_username']: input.username,
            ['p_email']: input.email,
            ['p_phone_number']: input.phone_number,
            ['p_address']: input.address,
            ['p_state']: input.state,
            ['p_country']: input.country,
            ['p_postal_code']: input.postal_code ?? null,
        });
        if (result.error) {
            throw Object.assign(new Error(`[Supabase:seller.submit] ${result.error.message}`), {
                code: result.error.code,
            });
        }
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        return toSellerRegistration(row);
    },
    // Guarded single-row update — only succeeds while status is PENDING.
    // Filters on user_id alone (not a surrogate id) since UNIQUE(user_id) means
    // there is at most one row per user — the self-service caller never needs
    // to know the registration's id just to edit "my own" registration.
    // Returns undefined (rather than throwing) when the WHERE clause matches no
    // row, so the service layer can disambiguate not-found / not-pending with
    // a single follow-up findByUserId, mirroring how physical-order.service.ts
    // resolves guarded-update ambiguity.
    async updatePendingByUser(userId, input) {
        const payload = {
            ...input,
            ['updated_at']: new Date().toISOString(),
        };
        const result = await (0, database_1.supabase)()
            .from('seller_registrations')
            .update(payload)
            .eq('user_id', userId)
            .eq('status', 'PENDING')
            .select('*')
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'seller.updatePendingByUser');
        return toSellerRegistration(result.data);
    },
    // Atomic status transition via RPC — see transition_seller_registration().
    // Also flips users.role, bumps token_version, and pauses/restores the
    // seller's MARKETPLACE artworks, all inside one DB transaction so a
    // concurrent artwork publish can never observe a half-applied suspension.
    async transition(registrationId, newStatus, adminId, notes) {
        const result = await (0, database_1.supabase)().rpc('transition_seller_registration', {
            ['p_registration_id']: registrationId,
            ['p_new_status']: newStatus,
            ['p_admin_id']: adminId,
            ['p_notes']: notes ?? null,
        });
        if (result.error) {
            throw Object.assign(new Error(`[Supabase:seller.transition] ${result.error.message}`), {
                code: result.error.code,
            });
        }
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        return toSellerRegistration(row);
    },
};
//# sourceMappingURL=seller.repository.js.map