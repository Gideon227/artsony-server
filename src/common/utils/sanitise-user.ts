import type { User, UserWithProfile } from '@/common/types'

// Strips fields that must never reach the client, regardless of whether the
// input is a bare User row or the profile-joined UserWithProfile — all
// UserProfileFields are already public-safe so nothing extra needs
// stripping for the joined case.
export function sanitiseUser<T extends User>(user: T) {
  const {
    password_hash,
    token_version,
    failed_login_attempts,
    locked_until,
    ...safe
  } = user
  return safe
}

export type SafeUser = ReturnType<typeof sanitiseUser<User>>
export type SafeUserWithProfile = ReturnType<typeof sanitiseUser<UserWithProfile>>
