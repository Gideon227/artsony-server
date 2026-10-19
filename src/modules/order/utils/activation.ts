import { createHash, randomBytes, randomInt } from 'crypto'

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// 12 digits, never starting with zero, so it survives being stored or printed
// as a number without losing its length.
export function generateTrackingNumber(): string {
  return String(randomInt(100_000_000_000, 1_000_000_000_000))
}

export function isExpired(expiresAt: string, now: number = Date.now()): boolean {
  return new Date(expiresAt).getTime() <= now
}
