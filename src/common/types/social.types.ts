// ── Comments ─────────────────────────────────────────────────────────────────

export type Comment = {
  id: string
  artwork_id: string
  user_id: string
  parent_id: string | null
  body: string
  likes_count: number
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

export type CommentAuthor = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

export type CommentWithAuthor = Comment & {
  author: CommentAuthor
  reply_count: number
}

export type CreateCommentInput = {
  artwork_id: string
  body: string
  parent_id?: string | undefined
}

export type CommentFilters = {
  artwork_id: string
  parent_id?: string | null | undefined // null = top-level only (default)
  page?: number | undefined
  limit?: number | undefined
}

// ── Follows ──────────────────────────────────────────────────────────────────

export type FollowUser = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  followers_count: number
}

export type FollowFilters = {
  page?: number | undefined
  limit?: number | undefined
}

// ── Blocks ───────────────────────────────────────────────────────────────────

export type BlockedUser = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  blocked_at: Date
}

export type BlockFilters = {
  page?: number | undefined
  limit?: number | undefined
}