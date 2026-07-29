"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRepository = void 0;
const database_1 = require("../../../config/database");
/**
 * Maps database rows (with ISO strings) to domain User objects (with Date objects).
 * Using bracket notation for all properties to satisfy 'noPropertyAccessFromIndexSignature'.
 */
function toUser(row) {
    return {
        ...row,
        ['locked_until']: row['locked_until'] ? new Date(row['locked_until']) : null,
        ['last_login_at']: row['last_login_at'] ? new Date(row['last_login_at']) : null,
        ['created_at']: new Date(row['created_at']),
        ['updated_at']: new Date(row['updated_at']),
        ['deleted_at']: row['deleted_at'] ? new Date(row['deleted_at']) : null,
    };
}
exports.userRepository = {
    async findById(id) {
        const result = await (0, database_1.supabase)()
            .from('users')
            .select('*')
            .eq('id', id)
            .is('deleted_at', null)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'findById');
        return toUser(result.data);
    },
    async findByEmail(email) {
        const result = await (0, database_1.supabase)()
            .from('users')
            .select('*')
            .ilike('email', email.trim())
            .is('deleted_at', null)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'findByEmail');
        return toUser(result.data);
    },
    async findByProviderId(provider, providerId) {
        const result = await (0, database_1.supabase)()
            .from('users')
            .select('*')
            .eq('provider', provider)
            .eq('provider_id', providerId)
            .is('deleted_at', null)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'findByProviderId');
        return toUser(result.data);
    },
    async searchByUsername(query, limit = 10) {
        const result = await (0, database_1.supabase)()
            .from('users')
            .select('*')
            .ilike('username', `%${query}%`)
            .eq('status', 'ACTIVE')
            .limit(limit);
        if (result.error)
            throw new Error(`[UserRepo:searchByUsername] ${result.error.message}`);
        return (result.data ?? []).map(toUser);
    },
    async create(input) {
        const result = await (0, database_1.supabase)()
            .from('users')
            .insert({
            ['email']: input.email.toLowerCase().trim(),
            ['username']: input.username ?? input.email,
            ['password_hash']: input.password_hash ?? null,
            ['provider']: input.provider ?? 'local',
            ['provider_id']: input.provider_id ?? null,
            ['role']: input.role ?? 'USER',
            ['status']: 'ACTIVE',
            ['token_version']: 0,
            ['failed_login_attempts']: 0,
            ['is_email_verified']: input.provider !== 'local',
            ['onboarded']: false,
        })
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'create');
        return toUser(result.data);
    },
    async update(id, input) {
        const payload = {
            ...input,
            ['updated_at']: new Date().toISOString(),
        };
        // FIXED: Use bracket notation for all assignments to the 'payload' Record
        if (input['locked_until'] instanceof Date) {
            payload['locked_until'] = input['locked_until'].toISOString();
        }
        if (input['last_login_at'] instanceof Date) {
            payload['last_login_at'] = input['last_login_at'].toISOString();
        }
        if (input['deleted_at'] instanceof Date) {
            payload['deleted_at'] = input['deleted_at'].toISOString();
        }
        const result = await (0, database_1.supabase)()
            .from('users')
            .update(payload)
            .eq('id', id)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'update');
        return toUser(result.data);
    },
    async incrementTokenVersion(id) {
        const result = await (0, database_1.supabase)()
            .rpc('increment_token_version', { ['user_id']: id });
        if (result.error) {
            throw new Error(`[Supabase:incrementTokenVersion] ${result.error.message}`);
        }
        return result['data'] ?? 0;
    },
    async softDelete(id) {
        const result = await (0, database_1.supabase)()
            .from('users')
            .update({
            ['deleted_at']: new Date().toISOString(),
            ['status']: 'DELETED',
            ['updated_at']: new Date().toISOString(),
        })
            .eq('id', id);
        if (result.error) {
            throw new Error(`[Supabase:softDelete] ${result.error.message}`);
        }
    },
    async hardDelete(id) {
        const result = await (0, database_1.supabase)()
            .from('users')
            .delete()
            .eq('id', id);
        if (result.error) {
            throw new Error(`[Supabase:hardDelete] ${result.error.message}`);
        }
    },
    // Sets onboarded = true and saves the user's selected interests atomically.
    // Called once during onboarding — subsequent calls are idempotent (re-saves
    // the new interests and keeps onboarded = true).
    async completeOnboarding(id, interests) {
        const result = await (0, database_1.supabase)()
            .from('users')
            .update({
            ['onboarded']: true,
            ['interests']: interests,
            ['updated_at']: new Date().toISOString(),
        })
            .eq('id', id)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'completeOnboarding');
        return toUser(result.data);
    },
    async recordLoginAttempt(id, success) {
        const result = success
            ? await (0, database_1.supabase)()
                .from('users')
                .update({
                ['failed_login_attempts']: 0,
                ['locked_until']: null,
                ['last_login_at']: new Date().toISOString(),
                ['updated_at']: new Date().toISOString(),
            })
                .eq('id', id)
            : await (0, database_1.supabase)()
                .rpc('increment_failed_login_attempts', { ['user_id']: id });
        if (result.error) {
            throw new Error(`[Supabase:recordLoginAttempt] ${result.error.message}`);
        }
    },
    async lockAccount(id, until) {
        const result = await (0, database_1.supabase)()
            .from('users')
            .update({
            ['locked_until']: until.toISOString(),
            ['updated_at']: new Date().toISOString(),
        })
            .eq('id', id);
        if (result.error) {
            throw new Error(`[Supabase:lockAccount] ${result.error.message}`);
        }
    },
};
//# sourceMappingURL=user.repository.js.map