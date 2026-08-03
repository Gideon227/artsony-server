import { moodboardRepository } from '../repositories/moodboard.repository'
import { artworkRepository } from '@/modules/artwork/repositories/artwork.repository'
import { NotFoundError, ForbiddenError } from '@/common/errors'
import type { Moodboard, MoodboardSummary } from '@/common/types/moodboard.types'

export async function createMoodboard(userId: string, title: string): Promise<Moodboard> {
  return moodboardRepository.create(userId, title)
}

export async function listMoodboards(userId: string): Promise<MoodboardSummary[]> {
  return moodboardRepository.findByUserId(userId)
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

export async function getMoodboard(id: string): Promise<Moodboard> {
  const moodboard = await moodboardRepository.findById(id)
  if (!moodboard) throw new NotFoundError('Moodboard')
  return moodboard
}