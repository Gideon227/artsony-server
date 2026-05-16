export type UserRole = 'USER' | 'ARTIST' | 'MODERATOR' | 'ADMIN'
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED'
export type AuthProvider = 'local' | 'google' | 'facebook'

export type User = {
  id: string
  email: string
  password_hash: string | null
  provider: AuthProvider
  provider_id: string | null
  is_email_verified: boolean
  onboarded: boolean
  interests: string[]
  role: UserRole
  status: UserStatus
  token_version: number
  failed_login_attempts: number
  locked_until: Date | null
  last_login_at: Date | null
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export type AuthSession = {
  id: string
  user_id: string
  refresh_token_hash: string
  user_agent: string | null
  ip_address: string | null
  expires_at: Date
  created_at: Date
  last_used_at: Date
  revoked_at: Date | null
}

export type PasswordResetToken = {
  id: string
  user_id: string
  reset_token_hash: string
  reset_email: string
  reset_attempts: number
  expires_at: Date
  used_at: Date | null
  created_at: Date
}

export type AuditLog = {
  id: string
  user_id: string | null
  action: string
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  created_at: Date
}

export type AccessTokenPayload = {
  sub: string       // user id
  sid: string       // session id
  role: UserRole
  ver: number       // token_version — invalidates on password change
  iat: number
  exp: number
  iss: string
  aud: string
}

export type OAuthProfile = {
  provider: AuthProvider
  providerId: string
  email: string
  displayName: string
  avatarUrl: string | null
}

export type RequestWithUser = {
  user: AccessTokenPayload
  sessionId: string
}
