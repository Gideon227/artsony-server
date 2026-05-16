import { supabase, assertNoError } from '@/config/database'
import type { User, AuthProvider, UserRole, UserStatus } from '@/common/types'

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
}