import { supabase } from '@/config/database'
import type { FollowUser, FollowFilters } from '@/common/types/social.types'
import type { PaginatedResult } from '@/common/types/commerce.types'

// follows.follower_id / following_id both point at users(id), not
// profiles(id) directly — profiles.user_id is a separate 1:1 FK. Two-hop
// embed, same pattern as artwork.repository.ts's CREATOR_EMBED.
const followUserEmbed = (fkConstraint: string) => `
  id,
  users!${fkConstraint} (
    id,
    username,
    profile:profiles (
      display_name,
      avatar_url,
      followers_count
    )
  )
`

function toFollowUser(userRow: any): FollowUser {
  const profile = userRow?.profile ?? {}
  return {
    id: userRow?.id,
    username: userRow?.username,
    display_name: profile.display_name ?? null,
    avatar_url: profile.avatar_url ?? null,
    followers_count: profile.followers_count ?? 0,
  }
}

export const followRepository = {
    // ── Toggle (atomic — see toggle_follow RPC) ─────────────────────────────────

    async toggle(followerId: string, followingId: string): Promise<boolean> {
        const result = await (supabase() as any).rpc('toggle_follow', {
            p_follower_id: followerId,
            p_following_id: followingId,
        })

        if (result.error) {
            throw new Error(`[Supabase:follow.toggle] ${result.error.message}`)
        }

        // RPC returns a single-row table `{ is_following: boolean }`
        const row = Array.isArray(result.data) ? result.data[0] : result.data
        return Boolean(row?.is_following)
    },

    // ── IsFollowing ──────────────────────────────────────────────────────────────

    async isFollowing(followerId: string, followingId: string): Promise<boolean> {
        const result = await (supabase() as any)
            .from('follows')
            .select('id')
            .eq('follower_id', followerId)
            .eq('following_id', followingId)
            .maybeSingle()

        if (result.error) {
            throw new Error(`[Supabase:follow.isFollowing] ${result.error.message}`)
        }
        return Boolean(result.data)
    },

    // ── Followed ids (used by the "Following" feed) ──────────────────────────────

    async getFollowedIds(followerId: string): Promise<string[]> {
        const result = await (supabase() as any)
            .from('follows')
            .select('following_id')
            .eq('follower_id', followerId)

        if (result.error) {
            throw new Error(`[Supabase:follow.getFollowedIds] ${result.error.message}`)
        }
        return (result.data ?? []).map((r: any) => r['following_id'])
    },

    // ── List followers / following ───────────────────────────────────────────────

    async listFollowers(userId: string, filters: FollowFilters): Promise<PaginatedResult<FollowUser>> {
        const page = Math.max(1, filters.page ?? 1)
        const limit = Math.min(50, Math.max(1, filters.limit ?? 20))
        const from = (page - 1) * limit
        const to = from + limit - 1

        const result = await (supabase() as any)
            .from('follows')
            .select(followUserEmbed('follows_follower_id_fkey'), { count: 'exact' })
            .eq('following_id', userId)
            .order('created_at', { ascending: false })
            .range(from, to)

        if (result.error) {
            throw new Error(`[Supabase:follow.listFollowers] ${result.error.message}`)
        }

        return {
            data: (result.data ?? []).map((r: any) => toFollowUser(r.users)),
            total: result.count ?? 0,
            page,
            limit,
            total_pages: Math.ceil((result.count ?? 0) / limit),
            has_next: from + limit < (result.count ?? 0),
            has_prev: page > 1,
        }
    },

    async listFollowing(userId: string, filters: FollowFilters): Promise<PaginatedResult<FollowUser>> {
        const page  = Math.max(1, filters.page ?? 1)
        const limit = Math.min(50, Math.max(1, filters.limit ?? 20))
        const from  = (page - 1) * limit
        const to    = from + limit - 1

        const result = await (supabase() as any)
            .from('follows')
            .select(followUserEmbed('follows_following_id_fkey'), { count: 'exact' })
            .eq('follower_id', userId)
            .order('created_at', { ascending: false })
            .range(from, to)

        if (result.error) {
            throw new Error(`[Supabase:follow.listFollowing] ${result.error.message}`)
        }

        return {
            data: (result.data ?? []).map((r: any) => toFollowUser(r.users)),
            total: result.count ?? 0,
            page,
            limit,
            total_pages: Math.ceil((result.count ?? 0) / limit),
            has_next: from + limit < (result.count ?? 0),
            has_prev: page > 1,
        }
    },
}