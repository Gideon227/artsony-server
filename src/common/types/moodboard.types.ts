import type { Artwork } from './artwork.types'

export type Moodboard = {
  id: string
  user_id: string
  title: string
  created_at: Date
  updated_at: Date
  artworks?: Artwork[] // Populated via join
}

export type CreateMoodboardInput = {
  title: string
}

export type UpdateMoodboardInput = {
  title: string
}