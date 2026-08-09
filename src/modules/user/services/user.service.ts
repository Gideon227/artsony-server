import { userRepository } from '@/modules/auth/repositories/user.repository'
import { ValidationError, NotFoundError } from '@/common/errors'
import type { User, UserWithProfile, PrivacySettings } from '@/common/types'

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

// ─── Profile update (username, art focus, bio, images, social links) ──────────

// Distinct from onboarding's own MAX_INTERESTS (10) — onboarding casts a
// wide net for future personalization, while "Art Focus" on the profile
// page is a small, curated set meant to be shown prominently.
const MAX_ART_FOCUS = 3

export type UpdateProfileBody = {
  username?: string
  display_name?: string | null
  bio?: string | null
  location?: string | null
  interests?: string[]
  avatar_url?: string | null
  background_url?: string | null
  website_url?: string | null
  behance_url?: string | null
  pinterest_url?: string | null
  twitter_url?: string | null
  linkedin_url?: string | null
}

export type UpdateProfileInput = {
  userId: string
  input: UpdateProfileBody
}

const PROFILE_FIELD_KEYS = [
  'display_name', 'bio', 'location', 'avatar_url', 'background_url',
  'website_url', 'behance_url', 'pinterest_url', 'twitter_url', 'linkedin_url',
] as const satisfies readonly (keyof UpdateProfileBody)[]

export async function updateProfile({ userId, input }: UpdateProfileInput): Promise<UserWithProfile> {
  const current = await userRepository.findByIdWithProfile(userId)
  if (!current) throw new NotFoundError('User')

  // ── Username — check uniqueness only if it's actually changing ────────────
  let nextUsername = current.username
  if (input.username !== undefined && input.username.trim() !== current.username) {
    const candidate = input.username.trim()
    const taken = await userRepository.isUsernameTaken(candidate, userId)
    if (taken) {
      throw new ValidationError('Validation failed', { username: 'This username is already taken' })
    }
    nextUsername = candidate
  }

  // ── Art focus — capped at 3 here regardless of what onboarding allows ─────
  if (input.interests !== undefined && input.interests.length > MAX_ART_FOCUS) {
    throw new ValidationError('Validation failed', {
      interests: `You may select at most ${MAX_ART_FOCUS} art focus tags`,
    })
  }
  const dedupedInterests = input.interests !== undefined
    ? [...new Set(input.interests.map((i) => i.toLowerCase().trim()))]
    : undefined

  // ── users table ─────────────────────────────────────────────────────────
  const userUpdates: { username?: string; interests?: string[] } = {}
  if (nextUsername !== current.username) userUpdates.username = nextUsername
  if (dedupedInterests !== undefined) userUpdates.interests = dedupedInterests

  if (Object.keys(userUpdates).length > 0) {
    await userRepository.update(userId, userUpdates)
  }

  // ── profiles table ──────────────────────────────────────────────────────
  const profileFields: Record<string, unknown> = {}
  for (const key of PROFILE_FIELD_KEYS) {
    if (input[key] !== undefined) profileFields[key] = input[key]
  }

  // Upsert whenever a profile field changed, or the username changed (so
  // profiles.username — the denormalised public copy — stays in sync).
  if (Object.keys(profileFields).length > 0 || nextUsername !== current.username) {
    await userRepository.upsertProfile(userId, nextUsername, profileFields)
  }

  const updated = await userRepository.findByIdWithProfile(userId)
  if (!updated) throw new NotFoundError('User')
  return updated
}

// ─── Privacy preferences ────────────────────────────────────────────────────

export async function getPrivacySettings(userId: string): Promise<PrivacySettings> {
  return userRepository.getPrivacySettings(userId)
}

export async function updatePrivacySettings(
  userId: string,
  settings: Partial<PrivacySettings>,
): Promise<PrivacySettings> {
  return userRepository.updatePrivacySettings(userId, settings)
}