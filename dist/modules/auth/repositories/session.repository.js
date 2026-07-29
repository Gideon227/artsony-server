"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionRepository = void 0;
const database_1 = require("../../../config/database");
const uuid_1 = require("uuid");
const config_1 = require("../../../config");
/**
 * Helper to map DB rows to domain types.
 * Using 'any' for row avoids the "neither type sufficiently overlaps" error
 * that occurs when casting Supabase's result.data (which can be null).
 */
function toSession(row) {
    return {
        ...row,
        expires_at: new Date(row['expires_at']),
        created_at: new Date(row['created_at']),
        last_used_at: new Date(row['last_used_at']),
        revoked_at: row['revoked_at'] ? new Date(row['revoked_at']) : null,
    };
}
exports.sessionRepository = {
    async create(input) {
        const expiresAt = new Date(Date.now() + config_1.config.jwt.refreshTokenTtl * 1000);
        const result = await (0, database_1.supabase)()
            .from('auth_sessions')
            .insert({
            id: (0, uuid_1.v4)(),
            user_id: input.userId,
            refresh_token_hash: input.refreshTokenHash,
            user_agent: input.userAgent,
            ip_address: input.ipAddress,
            expires_at: expiresAt.toISOString(),
            last_used_at: new Date().toISOString(),
        })
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'session.create');
        return toSession(result.data);
    },
    async findByTokenHash(hash) {
        const result = await (0, database_1.supabase)()
            .from('auth_sessions')
            .select('*')
            .eq('refresh_token_hash', hash)
            .is('revoked_at', null)
            .gt('expires_at', new Date().toISOString())
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'session.findByTokenHash');
        return toSession(result.data);
    },
    async findById(id) {
        const result = await (0, database_1.supabase)()
            .from('auth_sessions')
            .select('*')
            .eq('id', id)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'session.findById');
        return toSession(result.data);
    },
    async rotate(input) {
        const expiresAt = new Date(Date.now() + config_1.config.jwt.refreshTokenTtl * 1000);
        // Using (supabase() as any) here because RPC types are notoriously 
        // difficult to sync perfectly with generated types.
        const result = await (0, database_1.supabase)().rpc('rotate_session', {
            p_old_session_id: input.oldSessionId,
            p_user_id: input.userId,
            p_new_token_hash: input.newTokenHash,
            p_user_agent: input.userAgent,
            p_ip_address: input.ipAddress,
            p_expires_at: expiresAt.toISOString(),
        });
        if (result.error) {
            throw new Error(`[Supabase:session.rotate] ${result.error.message}`);
        }
        return toSession(result.data);
    },
    async revokeById(id) {
        const result = await (0, database_1.supabase)()
            .from('auth_sessions')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', id);
        if (result.error) {
            throw new Error(`[Supabase:session.revokeById] ${result.error.message}`);
        }
    },
    async revokeAllForUser(userId) {
        const result = await (0, database_1.supabase)()
            .from('auth_sessions')
            .update({ revoked_at: new Date().toISOString() })
            .eq('user_id', userId)
            .is('revoked_at', null);
        if (result.error) {
            throw new Error(`[Supabase:session.revokeAllForUser] ${result.error.message}`);
        }
    },
    async updateLastUsed(id) {
        const result = await (0, database_1.supabase)()
            .from('auth_sessions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', id);
        if (result.error) {
            throw new Error(`[Supabase:session.updateLastUsed] ${result.error.message}`);
        }
    },
    async purgeExpired() {
        const result = await (0, database_1.supabase)()
            .from('auth_sessions')
            .delete()
            .lt('expires_at', new Date().toISOString())
            .select('id');
        if (result.error) {
            throw new Error(`[Supabase:session.purgeExpired] ${result.error.message}`);
        }
        return result.data?.length ?? 0;
    },
};
//# sourceMappingURL=session.repository.js.map