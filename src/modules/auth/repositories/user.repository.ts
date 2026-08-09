import { supabase, assertNoError } from '@/config/database'
import type { User, UserWithProfile, UserProfileFields, PrivacySettings, AuthProvider, UserRole, UserStatus } from '@/common/types'

/**
 * Maps database rows (with ISO strings) to domain User objects (with Date objects).
 * Using bracket notation for all properties to satisfy 'noPropertyAccessFromIndexSignature'.
 */
function toUser(row: any): User {
  return {
    ...(row as User),
    ['locked_until']:  row['locked_until']  ? new Date(row['locked_until'])  : null,
    ['last_login_at']: row['last_login_at'] ? new Date(row['last_login_at']) : null,
    ['created_at']:    new Date(row['created_at']),
    ['updated_at']:    new Date(row['updated_at']),
    ['deleted_at']:    row['deleted_at']   ? new Date(row['deleted_at'])   : null,
    ['purged_at']:     row['purged_at']    ? new Date(row['purged_at'])    : null,
  }
}

// profiles is embedded as an array by Supabase's PostgREST join syntax even
// for a to-one relationship — normalise to a single object or null.
function toUserWithProfile(row: any): UserWithProfile {
  const rawProfile = row['profile']
  const profile = Array.isArray(rawProfile) ? (rawProfile[0] ?? null) : (rawProfile ?? null)

  return {
    ...toUser(row),
    // profiles.username is the canonical public-facing handle; fall back
    // to users.username for the (should-be-rare) case where no profiles
    // row exists yet.
    ['username']:        profile?.['username'] ?? row['username'],
    ['display_name']:    profile?.['display_name'] ?? null,
    ['avatar_url']:      profile?.['avatar_url'] ?? null,
    ['bio']:             profile?.['bio'] ?? null,
    ['location']:        profile?.['location'] ?? null,
    ['background_url']:  profile?.['background_url'] ?? null,
    ['website_url']:     profile?.['website_url'] ?? null,
    ['behance_url']:     profile?.['behance_url'] ?? null,
    ['pinterest_url']:   profile?.['pinterest_url'] ?? null,
    ['twitter_url']:     profile?.['twitter_url'] ?? null,
    ['linkedin_url']:    profile?.['linkedin_url'] ?? null,
    ['followers_count']: profile?.['followers_count'] ?? 0,
    ['following_count']: profile?.['following_count'] ?? 0,
    ['artworks_count']:  profile?.['artworks_count'] ?? 0,
    ['sales_count']:     profile?.['sales_count'] ?? 0,
  }
}

export type CreateUserInput = {
  username: string
  email: string
  password_hash?: string
  provider?: AuthProvider
  provider_id?: string
  role?: UserRole
}

export type UpdateUserInput = Partial<
  Pick<
    User,
    | 'username'
    | 'password_hash'
    | 'is_email_verified'
    | 'onboarded'
    | 'interests'
    | 'role'
    | 'status'
    | 'token_version'
    | 'failed_login_attempts'
    | 'locked_until'
    | 'last_login_at'
    | 'deleted_at'
    | 'provider_id'
  >
>

export const userRepository = {
  async findById(id: string): Promise<User | undefined> {
    const result = await (supabase() as any)
      .from('users')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'findById')
    return toUser(result.data)
  },

  async findByEmail(email: string): Promise<User | undefined> {
    const result = await (supabase() as any)
      .from('users')
      .select('*')
      .ilike('email', email.trim())
      .is('deleted_at', null)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'findByEmail')
    return toUser(result.data)
  },

  async findByProviderId(
    provider: AuthProvider,
    providerId: string
  ): Promise<User | undefined> {
    const result = await (supabase() as any)
      .from('users')
      .select('*')
      .eq('provider', provider)
      .eq('provider_id', providerId)
      .is('deleted_at', null)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'findByProviderId')
    return toUser(result.data)
  },

  async searchByUsername(query: string, limit = 10): Promise<User[]> {
    const result = await (supabase() as any)
      .from('users')
      .select('*')
      .ilike('username', `%${query}%`)
      .eq('status', 'ACTIVE')
      .limit(limit)

    if (result.error) throw new Error(`[UserRepo:searchByUsername] ${result.error.message}`)
    return (result.data ?? []).map(toUser)
  },

  // Thin, public-safe projection for batch lookups (e.g. resolving upload
  // collaborator ids to display names/avatars). Deliberately does NOT reuse
  // findById/sanitiseUser's shape — this never touches email or any
  // account-security fields, since results here are shown to other users.
  async findPublicProfilesByIds(ids: string[]): Promise<Array<{
    id: string
    username: string
    role: string
    profile: { display_name: string | null; avatar_url: string | null } | null
  }>> {
    if (ids.length === 0) return []

    const result = await (supabase() as any)
      .from('users')
      .select(`
        id,
        username,
        role,
        profile:profiles ( display_name, avatar_url )
      `)
      .in('id', ids)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)

    if (result.error) throw new Error(`[UserRepo:findPublicProfilesByIds] ${result.error.message}`)
    return (result.data ?? []).map((row: any) => ({
      id: row.id,
      username: row.username,
      role: row.role,
      profile: Array.isArray(row.profile) ? (row.profile[0] ?? null) : (row.profile ?? null),
    }))
  },

  async create(input: CreateUserInput): Promise<User> {
    const result = await (supabase() as any)
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
      .single()

    assertNoError(result, 'create')
    return toUser(result.data)
  },

  async update(id: string, input: UpdateUserInput): Promise<User> {
    const payload: Record<string, any> = {
      ...input,
      ['updated_at']: new Date().toISOString(),
    }

    // FIXED: Use bracket notation for all assignments to the 'payload' Record
    if (input['locked_until'] instanceof Date) {
      payload['locked_until'] = input['locked_until'].toISOString()
    }
    if (input['last_login_at'] instanceof Date) {
      payload['last_login_at'] = input['last_login_at'].toISOString()
    }
    if (input['deleted_at'] instanceof Date) {
      payload['deleted_at'] = input['deleted_at'].toISOString()
    }

    const result = await (supabase() as any)
      .from('users')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()

    assertNoError(result, 'update')
    return toUser(result.data)
  },

  async incrementTokenVersion(id: string): Promise<number> {
    const result = await (supabase() as any)
      .rpc('increment_token_version', { ['user_id']: id })

    if (result.error) {
      throw new Error(`[Supabase:incrementTokenVersion] ${result.error.message}`)
    }
    return (result['data'] as number) ?? 0
  },

  async softDelete(id: string): Promise<void> {
    const result = await (supabase() as any)
      .from('users')
      .update({
        ['deleted_at']: new Date().toISOString(),
        ['status']:     'DELETED' as UserStatus,
        ['updated_at']: new Date().toISOString(),
      })
      .eq('id', id)

    if (result.error) {
      throw new Error(`[Supabase:softDelete] ${result.error.message}`)
    }
  },

  // findById filters out soft-deleted rows (.is('deleted_at', null)), so the
  // purge job — which specifically operates on already soft-deleted users —
  // needs a lookup that can still see them.
  async findByIdIncludingDeleted(id: string): Promise<User | undefined> {
    const result = await (supabase() as any)
      .from('users')
      .select('*')
      .eq('id', id)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'findByIdIncludingDeleted')
    return toUser(result.data)
  },

  // Safety-net sweep: any DELETED user whose grace period (deleted_at +
  // graceDays, computed by the caller into `cutoff`) has elapsed and who
  // hasn't been purged yet. Catches accounts whose one-shot delayed purge
  // job was lost (e.g. Redis data loss) and the backlog of accounts
  // soft-deleted before this purge mechanism existed.
  async findPurgeCandidates(cutoff: Date, limit = 100): Promise<User[]> {
    const result = await (supabase() as any)
      .from('users')
      .select('*')
      .eq('status', 'DELETED')
      .is('purged_at', null)
      .lte('deleted_at', cutoff.toISOString())
      .limit(limit)

    if (result.error) {
      throw new Error(`[Supabase:findPurgeCandidates] ${result.error.message}`)
    }
    return (result.data ?? []).map(toUser)
  },

  // Anonymizes rather than hard-deletes. users.id is referenced
  // ON DELETE RESTRICT from messages, digital_delivery_tokens, orders, and
  // other tables that must retain their historical trail, so a raw DELETE
  // would fail for any account with real activity — see hardDelete() below,
  // which remains for narrower use cases where that's actually desired.
  async purgeUser(id: string): Promise<void> {
    const anonymizedEmail = `deleted-${id}@removed.artsony.internal`

    const usersResult = await (supabase() as any)
      .from('users')
      .update({
        ['email']:                 anonymizedEmail,
        ['username']:              `deleted-user-${id.slice(0, 8)}`,
        ['password_hash']:         null,
        ['provider_id']:           null,
        ['interests']:             [],
        ['failed_login_attempts']: 0,
        ['locked_until']:          null,
        ['purged_at']:             new Date().toISOString(),
        ['updated_at']:            new Date().toISOString(),
      })
      .eq('id', id)

    if (usersResult.error) {
      throw new Error(`[Supabase:purgeUser] ${usersResult.error.message}`)
    }

    const profileResult = await (supabase() as any)
      .from('profiles')
      .update({
        ['display_name']: null,
        ['avatar_url']:   null,
        ['bio']:          null,
        ['location']:     null,
      })
      .eq('user_id', id)

    // Note: an UPDATE that matches zero rows (e.g. a user with no profiles
    // row) succeeds silently with no error here — .single() isn't chained,
    // so there's no "not found" case to special-case. Only a genuine query
    // error should surface.
    if (profileResult.error) {
      throw new Error(`[Supabase:purgeUser:profile] ${profileResult.error.message}`)
    }
  },

  async hardDelete(id: string): Promise<void> {
    const result = await (supabase() as any)
      .from('users')
      .delete()
      .eq('id', id)

    if (result.error) {
      throw new Error(`[Supabase:hardDelete] ${result.error.message}`)
    }
  },

  // Sets onboarded = true and saves the user's selected interests atomically.
  // Called once during onboarding — subsequent calls are idempotent (re-saves
  // the new interests and keeps onboarded = true).
  async completeOnboarding(id: string, interests: string[]): Promise<User> {
    const result = await (supabase() as any)
      .from('users')
      .update({
        ['onboarded']:   true,
        ['interests']:   interests,
        ['updated_at']:  new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    assertNoError(result, 'completeOnboarding')
    return toUser(result.data)
  },

  async recordLoginAttempt(id: string, success: boolean): Promise<void> {
    const result = success
      ? await (supabase() as any)
          .from('users')
          .update({
            ['failed_login_attempts']: 0,
            ['locked_until']:          null,
            ['last_login_at']:         new Date().toISOString(),
            ['updated_at']:            new Date().toISOString(),
          })
          .eq('id', id)
      : await (supabase() as any)
          .rpc('increment_failed_login_attempts', { ['user_id']: id })

    if (result.error) {
      throw new Error(`[Supabase:recordLoginAttempt] ${result.error.message}`)
    }
  },

  async lockAccount(id: string, until: Date): Promise<void> {
    const result = await (supabase() as any)
      .from('users')
      .update({
        ['locked_until']: until.toISOString(),
        ['updated_at']:   new Date().toISOString(),
      })
      .eq('id', id)

    if (result.error) {
      throw new Error(`[Supabase:lockAccount] ${result.error.message}`)
    }
  },

  // Purpose-built, minimal read for enforcement checks (messaging,
  // comments, cart) — doesn't pull the rest of the profile join. Defaults
  // to EVERYONE (matching the column's DB default) if no profiles row
  // exists yet, so enforcement degrades to "no restriction" rather than
  // failing closed for users who haven't set anything.
  async getPrivacySettings(userId: string): Promise<PrivacySettings> {
    const result = await (supabase() as any)
      .from('profiles')
      .select('who_can_message, who_can_comment, who_can_purchase')
      .eq('user_id', userId)
      .maybeSingle()

    if (result.error) {
      throw new Error(`[Supabase:getPrivacySettings] ${result.error.message}`)
    }

    return {
      who_can_message:  result.data?.['who_can_message']  ?? 'EVERYONE',
      who_can_comment:  result.data?.['who_can_comment']  ?? 'EVERYONE',
      who_can_purchase: result.data?.['who_can_purchase'] ?? 'EVERYONE',
    }
  },

  async updatePrivacySettings(userId: string, settings: Partial<PrivacySettings>): Promise<PrivacySettings> {
    const result = await (supabase() as any)
      .from('profiles')
      .update({ ...settings, ['updated_at']: new Date().toISOString() })
      .eq('user_id', userId)

    if (result.error) {
      throw new Error(`[Supabase:updatePrivacySettings] ${result.error.message}`)
    }

    // Re-read rather than chaining .select().single() onto the update —
    // if no profiles row exists yet (edge case for a brand-new user who
    // hasn't touched their profile), the update matches zero rows without
    // erroring, and getPrivacySettings' EVERYONE defaults handle that
    // gracefully rather than this throwing on a missing row.
    return this.getPrivacySettings(userId)
  },

  // Full profile view for GET /me, login/register responses, and
  // PATCH /me's return value. LEFT JOINs profiles — a missing profiles row
  // (no application code path currently inserts one; it's presumably
  // created by a DB trigger not present in the migration files provided)
  // degrades gracefully to defaults rather than failing the request.
  async findByIdWithProfile(id: string): Promise<UserWithProfile | undefined> {
    const result = await (supabase() as any)
      .from('users')
      .select(`
        *,
        profile:profiles (
          username, display_name, avatar_url, bio, location, background_url,
          website_url, behance_url, pinterest_url, twitter_url, linkedin_url,
          followers_count, following_count, artworks_count, sales_count
        )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'findByIdWithProfile')
    return toUserWithProfile(result.data)
  },

  // Checks uniqueness against both users.username (auth-facing) and
  // profiles.username (denormalised public copy) since both are kept in
  // sync by upsertProfile below — a change that collides with either would
  // otherwise leave the two out of sync.
  async isUsernameTaken(username: string, excludingUserId: string): Promise<boolean> {
    const [usersResult, profilesResult] = await Promise.all([
      (supabase() as any).from('users').select('id').eq('username', username).neq('id', excludingUserId).limit(1),
      (supabase() as any).from('profiles').select('user_id').eq('username', username).neq('user_id', excludingUserId).limit(1),
    ])

    if (usersResult.error) throw new Error(`[Supabase:isUsernameTaken:users] ${usersResult.error.message}`)
    if (profilesResult.error) throw new Error(`[Supabase:isUsernameTaken:profiles] ${profilesResult.error.message}`)

    return (usersResult.data?.length ?? 0) > 0 || (profilesResult.data?.length ?? 0) > 0
  },

  // Upserts rather than updates: a profiles row isn't guaranteed to exist
  // for every user (see findByIdWithProfile's comment) — an upsert is
  // correct either way, and profiles.username is NOT NULL so it's always
  // included (falling back to the user's current users.username when the
  // caller isn't changing it).
  async upsertProfile(
    userId: string,
    username: string,
    fields: Partial<
      Pick<
        UserProfileFields,
        | 'display_name' | 'avatar_url' | 'bio' | 'location' | 'background_url'
        | 'website_url' | 'behance_url' | 'pinterest_url' | 'twitter_url' | 'linkedin_url'
      >
    >,
  ): Promise<void> {
    const result = await (supabase() as any)
      .from('profiles')
      .upsert(
        { ['user_id']: userId, ['username']: username, ...fields, ['updated_at']: new Date().toISOString() },
        { onConflict: 'user_id' },
      )

    if (result.error) {
      throw new Error(`[Supabase:upsertProfile] ${result.error.message}`)
    }
  },
}