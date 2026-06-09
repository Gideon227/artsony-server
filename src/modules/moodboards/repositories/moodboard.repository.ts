import { supabase } from '@/config/database' // Adjust to your db client path
import type { Moodboard } from '@/common/types/moodboard.types'

export const moodboardRepository = {
  async create(userId: string, title: string): Promise<Moodboard> {
    // Cast to any to bypass the 'never' generic constraint locally
    const db = supabase() as any

    const { data, error } = await db
      .from('moodboards')
      .insert({ user_id: userId, title })
      .select()
      .single()

    if (error) throw error
    return data as Moodboard
  },

  async update(id: string, title: string): Promise<Moodboard> {
    const db = supabase() as any

    const { data, error } = await db
      .from('moodboards')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Moodboard
  },

  async delete(id: string): Promise<void> {
    const db = supabase() as any
    const { error } = await db.from('moodboards').delete().eq('id', id)
    if (error) throw error
  },

  async findById(id: string): Promise<Moodboard | null> {
    const db = supabase() as any

    const { data, error } = await db
      .from('moodboards')
      .select(`
        *,
        moodboard_items (
          artworks (*)
        )
      `)
      .eq('id', id)
      .single()

    if (error || !data) return null

    // Cast data to any to bypass the spread error on 'never'
    const payload = data as any

    return {
      ...payload,
      artworks: payload.moodboard_items?.map((item: any) => item.artworks) || [],
    } as Moodboard
  },

  async addArtwork(moodboardId: string, artworkId: string): Promise<void> {
    const db = supabase() as any

    const { error } = await db
      .from('moodboard_items')
      .insert({ moodboard_id: moodboardId, artwork_id: artworkId })

    if (error && error.code !== '23505') throw error 
  },

  async removeArtwork(moodboardId: string, artworkId: string): Promise<void> {
    const db = supabase() as any

    const { error } = await db
      .from('moodboard_items')
      .delete()
      .match({ moodboard_id: moodboardId, artwork_id: artworkId })

    if (error) throw error
  }
}