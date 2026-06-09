import { moodboardRepository } from '../repositories/moodboard.repository'
import { NotFoundError, ForbiddenError } from '@/common/errors'
import type { Moodboard } from '@/common/types/moodboard.types'

export async function createMoodboard(userId: string, title: string): Promise<Moodboard> {
  return moodboardRepository.create(userId, title)
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

  // You can optionally add a check here to ensure the artwork.allow_moodboard_save is true

  await moodboardRepository.addArtwork(id, artworkId)
}

export async function removeArtworkFromMoodboard(id: string, userId: string, artworkId: string): Promise<void> {
  const moodboard = await moodboardRepository.findById(id)
  if (!moodboard) throw new NotFoundError('Moodboard')
  if (moodboard.user_id !== userId) throw new ForbiddenError('Not authorized to modify this moodboard')

  await moodboardRepository.removeArtwork(id, artworkId)
}

export async function getMoodboard(id: string): Promise<Moodboard> {
  const moodboard = await moodboardRepository.findById(id)
  if (!moodboard) throw new NotFoundError('Moodboard')
  return moodboard
}