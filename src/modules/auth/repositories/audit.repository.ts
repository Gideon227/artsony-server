import { supabase } from '@/config/database'
import { v4 as uuidv4 } from 'uuid'
import type { AuditLog } from '@/common/types'

export type AuditAction =
  | 'AUTH_REGISTER' | 'AUTH_LOGIN' | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGOUT' | 'AUTH_REFRESH' | 'AUTH_PASSWORD_RESET_REQUEST'
  | 'AUTH_PASSWORD_RESET_SUCCESS' | 'AUTH_PASSWORD_CHANGE'
  | 'AUTH_ACCOUNT_LOCKED' | 'AUTH_EMAIL_VERIFIED'
  | 'AUTH_OAUTH_LOGIN' | 'AUTH_ACCOUNT_DELETE_INITIATED'
  | 'AUTH_ACCOUNT_DELETED' | 'AUTH_SUSPICIOUS_REFRESH'

export const auditRepository = {
  // Fire-and-forget — audit writes must never block the request path.
  // Failures are logged to stderr but not re-thrown.
  log(input: {
    userId?: string
    action: AuditAction
    ipAddress?: string
    userAgent?: string
    metadata?: Record<string, unknown>
  }): void {
    (supabase() as any)
      .from('audit_logs')
      .insert({
        id: uuidv4(),
        user_id: input.userId ?? null,
        action: input.action,
        ip_address: input.ipAddress ?? null,
        user_agent: input.userAgent ?? null,
        metadata: input.metadata  ?? {},
      })
      .then(({ error }: any) => {
        if (error) console.error('[AuditLog] Write failed:', error.message)
      })
  },

  async findByUserId(userId: string, limit = 50): Promise<AuditLog[]> {
    const result = await supabase()
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (result.error) {
      console.error('[AuditLog] Read failed:', result.error.message)
      return []
    }

    return (result.data ?? []).map((row: AuditLog) => ({
      ...(row as AuditLog),
      created_at: new Date(row.created_at),
    }))
  },
}
