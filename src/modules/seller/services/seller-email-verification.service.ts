import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import { AppError, TooManyRequestsError } from '@/common/errors'
import { emailService } from '@/modules/email/email.service'
import {
  RedisKeys,
  RedisTTL,
  redisDel,
  redisGetJson,
  redisIncr,
  redisSetJson,
  redisSetNx,
  redisTtl,
} from '@/modules/redis/redis.client'

const CODE_LENGTH = 4
const MAX_VERIFY_ATTEMPTS = 5
const MAX_CODES_PER_DAY = 10

type StoredCode = {
  email: string
  salt: string
  hash: string
}

type StoredProof = {
  email: string
}

export type EmailCodeReceipt = {
  expires_in: number
  resend_in: number
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

function hashCode(code: string, salt: string, userId: string, email: string): string {
  return createHash('sha256').update(`${salt}:${userId}:${email}:${code}`).digest('hex')
}

function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && timingSafeEqual(left, right)
}

export const sellerEmailVerificationService = {
  async sendCode(userId: string, rawEmail: string): Promise<EmailCodeReceipt> {
    const email = normalizeEmail(rawEmail)

    const cooldownKey = RedisKeys.sellerEmailCooldown(userId)
    const acquired = await redisSetNx(cooldownKey, '1', RedisTTL.sellerEmailCooldown)
    if (!acquired) {
      const wait = Math.max(await redisTtl(cooldownKey), 1)
      throw new TooManyRequestsError(`Please wait ${wait} seconds before requesting another code`)
    }

    const sentToday = await redisIncr(RedisKeys.sellerEmailDaily(userId), RedisTTL.sellerEmailDaily)
    if (sentToday > MAX_CODES_PER_DAY) {
      throw new TooManyRequestsError('Too many verification codes requested today. Try again tomorrow')
    }

    const code = randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, '0')
    const salt = randomBytes(8).toString('hex')

    await redisSetJson<StoredCode>(
      RedisKeys.sellerEmailCode(userId),
      { email, salt, hash: hashCode(code, salt, userId, email) },
      RedisTTL.sellerEmailCode,
    )
    await Promise.all([
      redisDel(RedisKeys.sellerEmailAttempts(userId)),
      redisDel(RedisKeys.sellerEmailProof(userId)),
    ])

    try {
      await emailService.sendSellerVerificationCode({
        to: email,
        code,
        expiryMinutes: RedisTTL.sellerEmailCode / 60,
      })
    } catch (err) {
      console.error('[sellerEmailVerification] failed to enqueue code email:', (err as Error).message)
      await Promise.all([
        redisDel(RedisKeys.sellerEmailCode(userId)),
        redisDel(cooldownKey),
      ])
      throw new AppError(
        "We couldn't send the verification email. Please try again",
        502,
        'EMAIL_SEND_FAILED',
      )
    }

    return { expires_in: RedisTTL.sellerEmailCode, resend_in: RedisTTL.sellerEmailCooldown }
  },

  async verifyCode(userId: string, rawEmail: string, code: string): Promise<void> {
    const email = normalizeEmail(rawEmail)
    const codeKey = RedisKeys.sellerEmailCode(userId)
    const attemptsKey = RedisKeys.sellerEmailAttempts(userId)

    const stored = await redisGetJson<StoredCode>(codeKey)
    if (!stored) {
      throw new AppError('This code has expired. Request a new one', 400, 'CODE_EXPIRED')
    }
    if (stored.email !== email) {
      throw new AppError('This code was sent to a different email address', 400, 'CODE_EMAIL_MISMATCH')
    }

    const attempts = await redisIncr(attemptsKey, RedisTTL.sellerEmailCode)
    if (attempts > MAX_VERIFY_ATTEMPTS) {
      await redisDel(codeKey)
      throw new AppError('Too many incorrect attempts. Request a new code', 429, 'TOO_MANY_ATTEMPTS')
    }

    if (!hashesMatch(hashCode(code, stored.salt, userId, email), stored.hash)) {
      if (attempts >= MAX_VERIFY_ATTEMPTS) {
        await redisDel(codeKey)
        throw new AppError('Too many incorrect attempts. Request a new code', 429, 'TOO_MANY_ATTEMPTS')
      }
      throw new AppError('Invalid verification code', 400, 'INVALID_CODE')
    }

    await Promise.all([redisDel(codeKey), redisDel(attemptsKey)])
    await redisSetJson<StoredProof>(RedisKeys.sellerEmailProof(userId), { email }, RedisTTL.sellerEmailProof)
  },

  async assertEmailVerified(userId: string, rawEmail: string): Promise<void> {
    const proof = await redisGetJson<StoredProof>(RedisKeys.sellerEmailProof(userId))
    if (!proof || proof.email !== normalizeEmail(rawEmail)) {
      throw new AppError(
        'Verify your email address before submitting your application',
        403,
        'EMAIL_NOT_VERIFIED',
      )
    }
  },

  async clearProof(userId: string): Promise<void> {
    await redisDel(RedisKeys.sellerEmailProof(userId))
  },
}