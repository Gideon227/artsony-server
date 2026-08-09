import { followRepository } from '@/modules/follow/repositories/follow.repository'
import type { PrivacyLevel } from '@/common/types'

// Checks whether `actorId` is allowed to interact with `targetId` given
// targetId's privacy preference for that interaction type (messaging,
// commenting, purchasing). "FOLLOWERS" means only people who follow
// targetId are allowed — the standard "only my followers can message/
// comment on me" interpretation.
export async function isInteractionAllowed(
  privacy: PrivacyLevel,
  actorId: string,
  targetId: string,
): Promise<boolean> {
  if (actorId === targetId) return true
  if (privacy === 'EVERYONE') return true
  if (privacy === 'NO_ONE') return false
  return followRepository.isFollowing(actorId, targetId)
}
