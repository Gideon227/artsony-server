"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetTokenRepository = void 0;
const database_1 = require("../../../config/database");
const uuid_1 = require("uuid");
const config_1 = require("../../../config");
/**
 * Helper to map database rows to our domain type.
 * Using 'any' for the row here prevents "overlaps with null" errors in the methods.
 */
function toResetToken(row) {
    return {
        ...row,
        expires_at: new Date(row['expires_at']),
        used_at: row['used_at'] ? new Date(row['used_at']) : null,
        created_at: new Date(row['created_at']),
    };
}
exports.resetTokenRepository = {
    async create(input) {
        // 1. Invalidate all prior unused tokens for this user
        await (0, database_1.supabase)()
            .from('password_reset_tokens')
            .update({ used_at: new Date().toISOString() })
            .eq('user_id', input.userId)
            .is('used_at', null);
        const expiresAt = new Date(Date.now() + config_1.config.security.resetTokenExpiryMinutes * 60 * 1000);
        // 2. Insert the new token
        const result = await (0, database_1.supabase)()
            .from('password_reset_tokens')
            .insert({
            id: (0, uuid_1.v4)(),
            user_id: input.userId,
            reset_token_hash: input.tokenHash,
            reset_email: input.email.toLowerCase().trim(),
            reset_attempts: 0,
            expires_at: expiresAt.toISOString(),
        })
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'resetToken.create');
        return toResetToken(result.data);
    },
    async findValid(input) {
        const result = await (0, database_1.supabase)()
            .from('password_reset_tokens')
            .select('*')
            .eq('reset_token_hash', input.tokenHash)
            .ilike('reset_email', input.email.trim())
            .is('used_at', null)
            .gt('expires_at', new Date().toISOString())
            .lt('reset_attempts', config_1.config.security.resetMaxAttempts)
            .single();
        // PGRST116 means "No rows found" for .single()
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'resetToken.findValid');
        return toResetToken(result.data);
    },
    async incrementAttempts(id) {
        // This now matches your updated Database['public']['Functions'] type
        const result = await (0, database_1.supabase)()
            .rpc('increment_reset_attempts', { token_id: id });
        if (result.error) {
            throw new Error(`[Supabase:resetToken.incrementAttempts] ${result.error.message}`);
        }
    },
    async markUsed(id) {
        const result = await (0, database_1.supabase)()
            .from('password_reset_tokens')
            .update({ used_at: new Date().toISOString() })
            .eq('id', id);
        if (result.error) {
            throw new Error(`[Supabase:resetToken.markUsed] ${result.error.message}`);
        }
    },
    async invalidateAllForUser(userId) {
        const result = await (0, database_1.supabase)()
            .from('password_reset_tokens')
            .update({ used_at: new Date().toISOString() })
            .eq('user_id', userId)
            .is('used_at', null);
        if (result.error) {
            throw new Error(`[Supabase:resetToken.invalidateAllForUser] ${result.error.message}`);
        }
    },
};
//# sourceMappingURL=reset-token.repository.js.map