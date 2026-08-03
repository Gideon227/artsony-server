export type Comment = {
  id: string
  artwork_id: string
  user_id: string
  parent_id: string | null
  body: string
  likes_count: number
  author: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  }
  created_at: Date
  updated_at: Date
}

export type CreateCommentInput = {
  body: string
  parent_id?: string
}

export type PaginatedComments = {
  data: Comment[]
  total: number
  page: number
  limit: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
}