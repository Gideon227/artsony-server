import { supabase } from '@/config/database'
import type { BlockedUser, BlockFilters } from '@/common/types/social.types'
import type { PaginatedResult } from '@/common/types/commerce.types'

// user_blocks.blocker_id / blocked_id both point at users(id), not
// profiles(id) directly — same two-hop embed pattern as follow.repository.ts.
const blockedUserEmbed = `
  id,
  created_at,
  users!user_blocks_blocked_id_fkey (
    id,
    username,
    profile:profiles (
      display_name,
      avatar_url
    )
  )
`

function toBlockedUser(row: any): BlockedUser {
  const userRow = row?.users ?? {}
  const profile = userRow?.profile ?? {}
  return {
    id: userRow?.id,
    username: userRow?.username,
    display_name: profile.display_name ?? null,
    avatar_url: profile.avatar_url ?? null,
    blocked_at: new Date(row['created_at']),
  }
}

export const blockRepository = {
  // ── Block (idempotent) ──────────────────────────────────────────────────────

  async block(blockerId: string, blockedId: string): Promise<void> {
    const result = await (supabase() as any)
      .from('user_blocks')
      .upsert(
        { ['blocker_id']: blockerId, ['blocked_id']: blockedId },
        { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
      )

    if (result.error) {
      throw new Error(`[Supabase:block.block] ${result.error.message}`)
    }
  },

  // ── Unblock ──────────────────────────────────────────────────────────────────

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    const result = await (supabase() as any)
      .from('user_blocks')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId)

    if (result.error) {
      throw new Error(`[Supabase:block.unblock] ${result.error.message}`)
    }
  },

  // ── Is blocked (either direction) ───────────────────────────────────────────
  // Used by enforcement checks (messaging, comments) where either party
  // having blocked the other should prevent the interaction.

  async isBlockedEitherDirection(userA: string, userB: string): Promise<boolean> {
    const result = await (supabase() as any)
      .from('user_blocks')
      .select('id')
      .or(
        `and(blocker_id.eq.${userA},blocked_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_id.eq.${userA})`,
      )
      .limit(1)

    if (result.error) {
      throw new Error(`[Supabase:block.isBlockedEitherDirection] ${result.error.message}`)
    }
    return (result.data?.length ?? 0) > 0
  },

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const result = await (supabase() as any)
      .from('user_blocks')
      .select('id')
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId)
      .maybeSingle()

    if (result.error) {
      throw new Error(`[Supabase:block.isBlocked] ${result.error.message}`)
    }
    return Boolean(result.data)
  },

  // ── List blocked users ────────────────────────────────────────────────────────

  async listBlocked(blockerId: string, filters: BlockFilters): Promise<PaginatedResult<BlockedUser>> {
    const page  = Math.max(1, filters.page ?? 1)
    const limit = Math.min(50, Math.max(1, filters.limit ?? 20))
    const from  = (page - 1) * limit
    const to    = from + limit - 1

    const result = await (supabase() as any)
      .from('user_blocks')
      .select(blockedUserEmbed, { count: 'exact' })
      .eq('blocker_id', blockerId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (result.error) {
      throw new Error(`[Supabase:block.listBlocked] ${result.error.message}`)
    }

    return {
      data: (result.data ?? []).map(toBlockedUser),
      total: result.count ?? 0,
      page,
      limit,
      total_pages: Math.ceil((result.count ?? 0) / limit),
      has_next: from + limit < (result.count ?? 0),
      has_prev: page > 1,
    }
  },
}
