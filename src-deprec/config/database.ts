import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '@/config'
import type { Database } from '@/common/types/database'

// ─── Singleton ────────────────────────────────────────────────────────────────
// One client per process, initialised once on first import.
// Uses the SERVICE ROLE KEY — never the anon key on the server.
// The service role key bypasses Row Level Security, which is correct here
// because all access control is enforced by our own auth middleware layer,
// not by Supabase's RLS. RLS is an additional defence-in-depth layer only.

let _client: SupabaseClient<Database> | null = null

export function getSupabase(): SupabaseClient<Database> {
  if (!_client) {
    _client = createClient<Database>(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      {
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
      }
    )
  }
  return _client
}

// ─── Typed query helper ───────────────────────────────────────────────────────
// Thin wrapper — keeps repositories clean and gives us one place
// to add cross-cutting concerns (query logging, tracing) later.

export function supabase() {
  return getSupabase()
}

// ─── Error normaliser ─────────────────────────────────────────────────────────
// Supabase returns { data, error } tuples. This throws on error so
// repositories never have to check the error field manually.

export function assertNoError<T>(
  result: { data: T | null; error: { message: string; code?: string; details?: string } | null },
  context: string
): T {
  if (result.error) {
    throw new Error(`[Supabase:${context}] ${result.error.message} — ${result.error.details ?? ''}`)
  }
  if (result.data === null) {
    throw new Error(`[Supabase:${context}] Returned null data`)
  }
  return result.data
}

// Variant for operations that return an array (may be empty)
export function assertNoErrorMany<T>(
  result: { data: T[] | null; error: { message: string } | null },
  context: string
): T[] {
  if (result.error) {
    throw new Error(`[Supabase:${context}] ${result.error.message}`)
  }
  return result.data ?? []
}
