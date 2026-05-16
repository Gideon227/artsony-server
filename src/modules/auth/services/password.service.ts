import argon2 from 'argon2'
import { config } from '@/config'
import { ValidationError } from '@/common/errors'

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,         // argon2id — recommended, resists side-channel + GPU
  memoryCost: config.security.argon2.memoryCost,
  timeCost: config.security.argon2.timeCost,
  parallelism: config.security.argon2.parallelism,
}

// Minimum entropy requirements — enforced here, not in Zod schema alone
const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: /[A-Z]/,
  requireLowercase: /[a-z]/,
  requireDigit: /[0-9]/,
  requireSpecial: /[^A-Za-z0-9]/,
}

export function validatePasswordComplexity(password: string): void {
  const errors: string[] = []

  if (password.length < PASSWORD_RULES.minLength)
    errors.push(`At least ${PASSWORD_RULES.minLength} characters required`)
  if (password.length > PASSWORD_RULES.maxLength)
    errors.push('Password too long')
  if (!PASSWORD_RULES.requireUppercase.test(password))
    errors.push('At least one uppercase letter required')
  if (!PASSWORD_RULES.requireLowercase.test(password))
    errors.push('At least one lowercase letter required')
  if (!PASSWORD_RULES.requireDigit.test(password))
    errors.push('At least one number required')
  if (!PASSWORD_RULES.requireSpecial.test(password))
    errors.push('At least one special character required')

  if (errors.length > 0) {
    throw new ValidationError('Password does not meet security requirements', {
      password: errors.join('; '),
    })
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS)
}

// argon2.verify is already timing-safe — wrapping for explicitness
export async function verifyPassword(
  hash: string,
  candidate: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, candidate, ARGON2_OPTIONS)
  } catch {
    // Never leak whether user exists — return false on any error
    return false
  }
}

// Checks if hash needs rehashing (e.g. after security parameter upgrade)
export async function needsRehash(hash: string): Promise<boolean> {
  return argon2.needsRehash(hash, ARGON2_OPTIONS)
}
