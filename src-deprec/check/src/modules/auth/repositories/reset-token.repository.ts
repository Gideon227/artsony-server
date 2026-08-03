import { supabase, assertNoError } from '@/config/database'
import { v4 as uuidv4 } from 'uuid'
import type { PasswordResetToken } from '@/common/types'
import { config } from '@/config'

/**
 * Helper to map database rows to our domain type.
 * Using 'any' for the row here prevents "overlaps with null" errors in the methods.
 */
function toResetToken(row: any): PasswordResetToken {
  return {
    ...(row as PasswordResetToken),
    expires_at: new Date(row['expires_at']),
    used_at: row['used_at'] ? new Date(row['used_at']) : null,
    created_at: new Date(row['created_at']),
  }
}

export const resetTokenRepository = {
  async create(input: {
    userId: string
    tokenHash: string
    email: string
  }): Promise<PasswordResetToken> {
    // 1. Invalidate all prior unused tokens for this user
    await (supabase() as any)
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', input.userId)
      .is('used_at', null)

    const expiresAt = new Date(
      Date.now() + config.security.resetTokenExpiryMinutes * 60 * 1000
    )

    // 2. Insert the new token
    const result = await (supabase() as any)
      .from('password_reset_tokens')
      .insert({
        id: uuidv4(),
        user_id: input.userId,
        reset_token_hash: input.tokenHash,
        reset_email: input.email.toLowerCase().trim(),
        reset_attempts: 0,
        expires_at: expiresAt.toISOString(),
      })
      .select('*')
      .single()

    assertNoError(result, 'resetToken.create')
    return toResetToken(result.data)
  },

  async findValid(input: {
    tokenHash: string
    email: string
  }): Promise<PasswordResetToken | undefined> {
    const result = await (supabase() as any)
      .from('password_reset_tokens')
      .select('*')
      .eq('reset_token_hash', input.tokenHash)
      .ilike('reset_email', input.email.trim()) 
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .lt('reset_attempts', config.security.resetMaxAttempts)
      .single()

    // PGRST116 means "No rows found" for .single()
    if (result.error?.code === 'PGRST116') return undefined
    
    assertNoError(result, 'resetToken.findValid')
    return toResetToken(result.data)
  },

  async incrementAttempts(id: string): Promise<void> {
    // This now matches your updated Database['public']['Functions'] type
    const result = await (supabase() as any)
      .rpc('increment_reset_attempts', { token_id: id })

    if (result.error) {
      throw new Error(`[Supabase:resetToken.incrementAttempts] ${result.error.message}`)
    }
  },

  async markUsed(id: string): Promise<void> {
    const result = await (supabase() as any)
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', id)

    if (result.error) {
      throw new Error(`[Supabase:resetToken.markUsed] ${result.error.message}`)
    }
  },

  async invalidateAllForUser(userId: string): Promise<void> {
    const result = await (supabase() as any)
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('used_at', null)

    if (result.error) {
      throw new Error(`[Supabase:resetToken.invalidateAllForUser] ${result.error.message}`)
    }
  },
}