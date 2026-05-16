import { userRepository } from '@/modules/auth/repositories/user.repository'
import { ValidationError, NotFoundError } from '@/common/errors'
import type { User } from '@/common/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_INTERESTS = 1
const MAX_INTERESTS = 10
const MAX_INTEREST_LENGTH = 50

// const ALLOWED_INTERESTS = new Set([
//   // Visual arts
//   'painting', 'drawing', 'sculpture', 'photography', 'digital-art',
//   'illustration', 'printmaking', 'ceramics', 'textile-art', 'collage',
//   // Styles & movements
//   'abstract', 'realism', 'surrealism', 'minimalism', 'expressionism',
//   'pop-art', 'street-art', 'contemporary', 'classical', 'impressionism',
//   // Themes
//   'portrait', 'landscape', 'nature', 'urban', 'architecture',
//   'figurative', 'conceptual', 'storytelling', 'experimental', 'mixed-media',
// ])

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompleteOnboardingInput = {
  userId: string
  interests: string[]
  ctx: { ipAddress: string | null; userAgent: string | null }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export async function completeOnboarding({
  userId,
  interests,
  ctx: _ctx,
}: CompleteOnboardingInput): Promise<User> {
  // ── Validate ───────────────────────────────────────────────────────────────

  if (!Array.isArray(interests) || interests.length < MIN_INTERESTS) {
    throw new ValidationError('Validation failed', {
      interests: `Please select at least ${MIN_INTERESTS} interest`,
    })
  }

  if (interests.length > MAX_INTERESTS) {
    throw new ValidationError('Validation failed', {
      interests: `You may select at most ${MAX_INTERESTS} interests`,
    })
  }

//   const invalid = interests.find(
//     (i) =>
//       typeof i !== 'string' ||
//       i.trim().length === 0 ||
//       i.length > MAX_INTEREST_LENGTH ||
//       !ALLOWED_INTERESTS.has(i.toLowerCase().trim())
//   )

//   if (invalid !== undefined) {
//     throw new ValidationError('Validation failed', {
//       interests: `"${invalid}" is not a recognised interest`,
//     })
//   }

  // ── Persist ────────────────────────────────────────────────────────────────

  const user = await userRepository.findById(userId)
  if (!user) throw new NotFoundError('User')

  const deduped = [...new Set(interests.map((i) => i.toLowerCase().trim()))]

  const updated = await userRepository.update(userId, {
    interests: deduped,
    onboarded: true,
  })

  return updated
}