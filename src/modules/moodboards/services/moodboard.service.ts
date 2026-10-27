import { moodboardRepository } from '../repositories/moodboard.repository'
import { artworkRepository } from '@/modules/artwork/repositories/artwork.repository'
import { blockRepository } from '@/modules/block/repositories/block.repository'
import { NotFoundError, ForbiddenError } from '@/common/errors'
import type { Moodboard, MoodboardSummary } from '@/common/types/moodboard.types'

export async function createMoodboard(userId: string, title: string): Promise<Moodboard> {
  return moodboardRepository.create(userId, title)
}

export async function listMoodboards(userId: string): Promise<MoodboardSummary[]> {
  return moodboardRepository.findByUserId(userId)
}

// Another user's boards, as the requester is allowed to see them. Blocked
// pairs (either direction) get a 404 so a block doesn't reveal the account.
export async function listUserMoodboards(ownerId: string, requesterId: string): Promise<MoodboardSummary[]> {
  if (ownerId === requesterId) return moodboardRepository.findByUserId(ownerId)

  if (await blockRepository.isBlockedEitherDirection(ownerId, requesterId)) {
    throw new NotFoundError('User')
  }

  return moodboardRepository.findVisibleByUserId(ownerId, requesterId)
}

export async function updateMoodboard(id: string, userId: string, title: string): Promise<Moodboard> {
  const moodboard = await moodboardRepository.findById(id)
  if (!moodboard) throw new NotFoundError('Moodboard')
  if (moodboard.user_id !== userId) throw new ForbiddenError('Not authorized to edit this moodboard')

  return moodboardRepository.update(id, title)
}

export async function deleteMoodboard(id: string, userId: string): Promise<void> {
  const moodboard = await moodboardRepository.findById(id)
  if (!moodboard) throw new NotFoundError('Moodboard')
  if (moodboard.user_id !== userId) throw new ForbiddenError('Not authorized to delete this moodboard')

  await moodboardRepository.delete(id)
}

export async function addArtworkToMoodboard(id: string, userId: string, artworkId: string): Promise<void> {
  const moodboard = await moodboardRepository.findById(id)
  if (!moodboard) throw new NotFoundError('Moodboard')
  if (moodboard.user_id !== userId) throw new ForbiddenError('Not authorized to modify this moodboard')

  const artwork = await artworkRepository.findById(artworkId)
  if (!artwork) throw new NotFoundError('Artwork')
  if (artwork.allow_moodboard_save === false) {
    throw new ForbiddenError('This artist has disabled saving this artwork to moodboards')
  }

  await moodboardRepository.addArtwork(id, artworkId)
}

export async function removeArtworkFromMoodboard(id: string, userId: string, artworkId: string): Promise<void> {
  const moodboard = await moodboardRepository.findById(id)
  if (!moodboard) throw new NotFoundError('Moodboard not found')
  if (moodboard.user_id !== userId) throw new ForbiddenError('Not authorized to modify this moodboard')

  await moodboardRepository.removeArtwork(id, artworkId)
}

export async function getMoodboard(id: string, requesterId: string): Promise<Moodboard> {
  const moodboard = await moodboardRepository.findById(id)
  if (!moodboard) throw new NotFoundError('Moodboard')
  // Boards are viewable by any signed-in user (writes stay owner-only). The
  // artwork filter below already limits what a non-owner can see.
  if (
    moodboard.user_id !== requesterId &&
    (await blockRepository.isBlockedEitherDirection(moodboard.user_id, requesterId))
  ) {
    throw new NotFoundError('Moodboard')
  }

  // The raw join returns bare artwork rows. Re-read them through the artwork
  // repository so each one carries its creator and the viewer's like/save
  // state, in the order they were added, minus anything deleted or no
  // longer visible to the viewer.
  const artworkIds = await moodboardRepository.findArtworkIds(id)
  const artworks = await artworkRepository.findManyByIdsOrdered(artworkIds, requesterId)

  return {
    ...moodboard,
    artworks: artworks.filter((artwork) => {
      if (artwork.deleted_at) return false
      if (artwork.visibility === 'PUBLIC' && artwork.status === 'PUBLISHED') return true
      return artwork.creator_id === requesterId || artwork.collaborator_ids.includes(requesterId)
    }),
  }
}