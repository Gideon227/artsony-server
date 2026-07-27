import { supabase, assertNoError } from '@/config/database'
import type {
  Comment,
  CommentWithAuthor,
  CreateCommentInput,
  CommentFilters,
} from '@/common/types/social.types'
import type { PaginatedResult } from '@/common/types/commerce.types'

// Same two-hop pattern as follow.repository.ts — comments.user_id points at
// users(id), profile fields live one hop further at profiles.user_id.
const COMMENT_EMBED = `
  id,
  artwork_id,
  user_id,
  parent_id,
  body,
  likes_count,
  reply_count,
  created_at,
  updated_at,
  deleted_at,
  author:users!comments_user_id_fkey (
    id,
    username,
    profile:profiles (
      display_name,
      avatar_url
    )
  )
`

function toComment(row: any): CommentWithAuthor {
    const profile = row.author?.profile ?? {}
    return {
            id: row['id'],
            artwork_id: row['artwork_id'],
            user_id: row['user_id'],
            parent_id: row['parent_id'] ?? null,
            body: row['body'],
            likes_count:  row['likes_count'] ?? 0,
            reply_count: row['reply_count'] ?? 0,
            created_at: new Date(row['created_at']),
            updated_at: new Date(row['updated_at']),
            deleted_at: row['deleted_at'] ? new Date(row['deleted_at']) : null,
            author: {
            id: row.author?.id,
            username: row.author?.username,
            display_name: profile.display_name ?? null,
            avatar_url: profile.avatar_url ?? null,
        },
    }
    }

    export const commentRepository = {
    // ── Create ─────────────────────────────────────────────────────────────────

    async create(input: CreateCommentInput & { userId: string }): Promise<CommentWithAuthor> {
        const result = await (supabase() as any)
        .from('comments')
        .insert({
            artwork_id: input.artwork_id,
            user_id: input.userId,
            parent_id:  input.parent_id ?? null,
            body: input.body,
        })
        .select(COMMENT_EMBED)
        .single()

        assertNoError(result, 'comment.create')
        return toComment(result.data)
    },

    // ── GetById (ownership checks) ───────────────────────────────────────────────

    async getById(id: string): Promise<Comment | undefined> {
        const result = await (supabase() as any)
            .from('comments')
            .select('id, artwork_id, user_id, parent_id, body, likes_count, created_at, updated_at, deleted_at')
            .eq('id', id)
            .is('deleted_at', null)
            .maybeSingle()

        if (result.error) {
            throw new Error(`[Supabase:comment.getById] ${result.error.message}`)
        }
        if (!result.data) return undefined

        return {
            id: result.data['id'],
            artwork_id: result.data['artwork_id'],
            user_id: result.data['user_id'],
            parent_id: result.data['parent_id'] ?? null,
            body: result.data['body'],
            likes_count: result.data['likes_count'] ?? 0,
            created_at: new Date(result.data['created_at']),
            updated_at: new Date(result.data['updated_at']),
            deleted_at: result.data['deleted_at'] ? new Date(result.data['deleted_at']) : null,
        }
    },

    // ── List top-level comments for an artwork ───────────────────────────────────

    async listTopLevel(filters: CommentFilters): Promise<PaginatedResult<CommentWithAuthor>> {
        const page  = Math.max(1, filters.page ?? 1)
        const limit = Math.min(50, Math.max(1, filters.limit ?? 20))
        const from  = (page - 1) * limit
        const to = from + limit - 1

        const result = await (supabase() as any)
            .from('comments')
            .select(COMMENT_EMBED, { count: 'exact' })
            .eq('artwork_id', filters.artwork_id)
            .is('parent_id', null)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .range(from, to)

        if (result.error) {
            throw new Error(`[Supabase:comment.listTopLevel] ${result.error.message}`)
        }

        return {
            data: (result.data ?? []).map(toComment),
            total: result.count ?? 0,
            page,
            limit,
            total_pages: Math.ceil((result.count ?? 0) / limit),
            has_next: from + limit < (result.count ?? 0),
            has_prev: page > 1,
        }
    },

    // ── List replies to a comment ────────────────────────────────────────────────

    async listReplies(parentId: string, filters: Omit<CommentFilters, 'artwork_id'>): Promise<PaginatedResult<CommentWithAuthor>> {
        const page = Math.max(1, filters.page ?? 1)
        const limit = Math.min(50, Math.max(1, filters.limit ?? 20))
        const from = (page - 1) * limit
        const to = from + limit - 1

        const result = await (supabase() as any)
        .from('comments')
        .select(COMMENT_EMBED, { count: 'exact' })
        .eq('parent_id', parentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .range(from, to)

        if (result.error) {
        throw new Error(`[Supabase:comment.listReplies] ${result.error.message}`)
        }

        return {
        data:        (result.data ?? []).map(toComment),
        total:       result.count ?? 0,
        page,
        limit,
        total_pages: Math.ceil((result.count ?? 0) / limit),
        has_next:    from + limit < (result.count ?? 0),
        has_prev:    page > 1,
        }
    },

    // ── Soft delete ───────────────────────────────────────────────────────────────

    async softDelete(id: string): Promise<void> {
        const result = await (supabase() as any)
        .from('comments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)

        if (result.error) {
        throw new Error(`[Supabase:comment.softDelete] ${result.error.message}`)
        }
    },
}