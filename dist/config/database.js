"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabase = getSupabase;
exports.supabase = supabase;
exports.assertNoError = assertNoError;
exports.assertNoErrorMany = assertNoErrorMany;
const supabase_js_1 = require("@supabase/supabase-js");
const config_1 = require("../config");
// ─── Singleton ────────────────────────────────────────────────────────────────
// One client per process, initialised once on first import.
// Uses the SERVICE ROLE KEY — never the anon key on the server.
// The service role key bypasses Row Level Security, which is correct here
// because all access control is enforced by our own auth middleware layer,
// not by Supabase's RLS. RLS is an additional defence-in-depth layer only.
let _client = null;
function getSupabase() {
    if (!_client) {
        _client = (0, supabase_js_1.createClient)(config_1.config.supabase.url, config_1.config.supabase.serviceRoleKey, {
            auth: {
                // Server-side: we manage sessions ourselves via JWT + Redis.
                // Disable Supabase's built-in auth helpers entirely.
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
            },
            db: {
                schema: 'public',
            },
            global: {
                headers: {
                    'x-application-name': 'artsony-backend',
                },
            },
        });
    }
    return _client;
}
// ─── Typed query helper ───────────────────────────────────────────────────────
// Thin wrapper — keeps repositories clean and gives us one place
// to add cross-cutting concerns (query logging, tracing) later.
function supabase() {
    return getSupabase();
}
// ─── Error normaliser ─────────────────────────────────────────────────────────
// Supabase returns { data, error } tuples. This throws on error so
// repositories never have to check the error field manually.
function assertNoError(result, context) {
    if (result.error) {
        throw new Error(`[Supabase:${context}] ${result.error.message} — ${result.error.details ?? ''}`);
    }
    if (result.data === null) {
        throw new Error(`[Supabase:${context}] Returned null data`);
    }
    return result.data;
}
// Variant for operations that return an array (may be empty)
function assertNoErrorMany(result, context) {
    if (result.error) {
        throw new Error(`[Supabase:${context}] ${result.error.message}`);
    }
    return result.data ?? [];
}
//# sourceMappingURL=database.js.map