import { supabase, assertNoError } from '@/config/database'
import type {
  Conversation,
  ConversationParticipant,
  ConversationWithDetails,
  ConversationSummary,
  ParticipantProfile,
  MessagePreview,
  ConversationType,
  ParticipantRole,
} from '@/common/types'

// ─── Mappers ──────────────────────────────────────────────────────────────────

function toConversation(row: Record<string, unknown>): Conversation {
  return {
    id:               row['id'] as string,
    type:             row['type'] as ConversationType,
    title:            (row['title'] as string | null) ?? null,
    created_by:       row['created_by'] as string,
    last_message_id:  (row['last_message_id'] as string | null) ?? null,
    last_activity_at: new Date(row['last_activity_at'] as string),
    metadata:         (row['metadata'] as Record<string, unknown>) ?? {},
    created_at:       new Date(row['created_at'] as string),
    updated_at:       new Date(row['updated_at'] as string),
  }
}

function toParticipant(row: Record<string, unknown>): ConversationParticipant {
  return {
    id:              row['id'] as string,
    conversation_id: row['conversation_id'] as string,
    user_id:         row['user_id'] as string,
    role:            row['role'] as ParticipantRole,
    last_read_at:    new Date(row['last_read_at'] as string),
    is_muted:        row['is_muted'] as boolean,
    joined_at:       new Date(row['joined_at'] as string),
    left_at:         row['left_at'] ? new Date(row['left_at'] as string) : null,
  }
}

function toParticipantProfile(row: Record<string, unknown>): ParticipantProfile {
  return {
    user_id:      row['user_id'] as string,
    role:         row['role'] as ParticipantRole,
    last_read_at: new Date(row['last_read_at'] as string),
    is_muted:     row['is_muted'] as boolean,
    joined_at:    new Date(row['joined_at'] as string),
    left_at:      row['left_at'] ? new Date(row['left_at'] as string) : null,
    email:        row['email'] as string,
    display_name: (row['display_name'] as string | null) ?? null,
    avatar_url:   (row['avatar_url'] as string | null) ?? null,
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

export const conversationRepository = {

  // ── Get or create a direct conversation (atomic via RPC) ──────────────────

  async getOrCreateDirect(userA: string, userB: string): Promise<string> {
    const result = await (supabase() as any).rpc('get_or_create_direct_conversation', {
      p_user_a: userA,
      p_user_b: userB,
    })
    if (result.error) {
      throw new Error(`[ConvRepo:getOrCreateDirect] ${result.error.message}`)
    }
    return result.data as string
  },

  // ── Create a broadcast conversation (atomic via RPC) ──────────────────────

  async createBroadcast(input: {
    senderId:      string
    title:         string | null
    recipientIds:  string[]
  }): Promise<string> {
    const result = await (supabase() as any).rpc('create_broadcast_conversation', {
      p_sender_id:     input.senderId,
      p_title:         input.title,
      p_recipient_ids: input.recipientIds,
    })
    if (result.error) {
      throw new Error(`[ConvRepo:createBroadcast] ${result.error.message}`)
    }
    return result.data as string
  },

  // ── Find conversation by id (no auth check — callers must verify access) ──

  async findById(id: string): Promise<Conversation | undefined> {
    const result = await (supabase() as any)
      .from('conversations')
      .select('*')
      .eq('id', id)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'ConvRepo:findById')
    return toConversation(result.data as Record<string, unknown>)
  },

  // ── Get conversation with participants and unread count (via RPC) ─────────

  async findByIdWithDetails(
    conversationId: string,
    requestingUserId: string,
  ): Promise<ConversationWithDetails | undefined> {
    const result = await (supabase() as any).rpc('get_conversation_with_participants', {
      p_conversation_id: conversationId,
      p_requesting_user: requestingUserId,
    })

    if (result.error) {
      // RPC raises SQLSTATE P0001 for access denied
      if (result.error.message?.includes('access denied')) return undefined
      throw new Error(`[ConvRepo:findByIdWithDetails] ${result.error.message}`)
    }

    const rows = result.data as Array<Record<string, unknown>>
    if (!rows || rows.length === 0) return undefined

    const row = rows[0]!
    const conv = toConversation(row)
    const rawParticipants = (row['participants'] as Array<Record<string, unknown>>) ?? []

    return {
      ...conv,
      participants: rawParticipants.map((p) => ({
        id:              '',  // not returned by the RPC aggregation
        conversation_id: conversationId,
        user_id:         p['user_id'] as string,
        role:            p['role'] as ParticipantRole,
        last_read_at:    new Date(p['last_read_at'] as string),
        is_muted:        p['is_muted'] as boolean,
        joined_at:       new Date(p['joined_at'] as string),
        left_at:         null,
      })),
      unread_count: Number(row['unread_count'] ?? 0),
    }
  },

  // ── List conversations for a user (cursor-paginated) ─────────────────────

  async listForUser(input: {
    userId:  string
    cursor?: string       // last_activity_at ISO string
    limit?:  number
    type?:   ConversationType
  }): Promise<ConversationSummary[]> {
    const limit = Math.min(input.limit ?? 20, 50)

    let query = (supabase() as any)
      .from('conversations')
      .select(`
        id,
        type,
        title,
        last_activity_at,
        last_message_id,
        created_by,
        conversation_participants!inner (
          user_id,
          last_read_at,
          left_at
        )
      `)
      .eq('conversation_participants.user_id', input.userId)
      .is('conversation_participants.left_at', null)
      .order('last_activity_at', { ascending: false })
      .limit(limit)

    if (input.cursor) {
      query = query.lt('last_activity_at', input.cursor)
    }

    if (input.type) {
      query = query.eq('type', input.type)
    }

    const result = await query
    assertNoError(result, 'ConvRepo:listForUser')

    const rows = (result.data ?? []) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id:               row['id'] as string,
      type:             row['type'] as ConversationType,
      title:            (row['title'] as string | null) ?? null,
      last_activity_at: new Date(row['last_activity_at'] as string),
      last_message_id:  (row['last_message_id'] as string | null) ?? null,
      unread_count:     0,  // populated by service layer via get_conversation_unread_counts RPC
    }))
  },

  // ── Search conversations ──────────────────────────────────────────────────

  async search(input: {
    userId: string
    query:  string
    limit?: number
  }): Promise<ConversationSummary[]> {
    const result = await (supabase() as any).rpc('search_conversations', {
      p_user_id: input.userId,
      p_query:   input.query,
      p_limit:   input.limit ?? 20,
    })
    if (result.error) {
      throw new Error(`[ConvRepo:search] ${result.error.message}`)
    }

    const rows = (result.data ?? []) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      id:               row['conversation_id'] as string,
      type:             row['type'] as ConversationType,
      title:            (row['title'] as string | null) ?? null,
      last_activity_at: new Date(row['last_activity_at'] as string),
      last_message_id:  (row['last_message_id'] as string | null) ?? null,
      unread_count:     Number(row['unread_count'] ?? 0),
    }))
  },

  // ── Update conversation metadata/title ────────────────────────────────────

  async update(id: string, input: {
    title?:    string | null
    metadata?: Record<string, unknown>
  }): Promise<Conversation> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.title    !== undefined) payload['title']    = input.title
    if (input.metadata !== undefined) payload['metadata'] = input.metadata

    const result = await (supabase() as any)
      .from('conversations')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()

    assertNoError(result, 'ConvRepo:update')
    return toConversation(result.data as Record<string, unknown>)
  },

  // ── Participant checks ────────────────────────────────────────────────────

  async isParticipant(conversationId: string, userId: string): Promise<boolean> {
    const result = await (supabase() as any)
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .is('left_at', null)
      .single()

    if (result.error?.code === 'PGRST116') return false
    return !result.error
  },

  async getParticipant(
    conversationId: string,
    userId: string,
  ): Promise<ConversationParticipant | undefined> {
    const result = await (supabase() as any)
      .from('conversation_participants')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .is('left_at', null)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'ConvRepo:getParticipant')
    return toParticipant(result.data as Record<string, unknown>)
  },

  async getParticipantIds(conversationId: string): Promise<string[]> {
    const result = await (supabase() as any)
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .is('left_at', null)

    assertNoError(result, 'ConvRepo:getParticipantIds')
    return ((result.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)
  },

  async getParticipantsWithProfiles(
    conversationId: string,
  ): Promise<ParticipantProfile[]> {
    const result = await (supabase() as any)
      .from('conversation_participants')
      .select(`
        user_id,
        role,
        last_read_at,
        is_muted,
        joined_at,
        left_at,
        users!inner ( email )
      `)
      .eq('conversation_id', conversationId)
      .is('left_at', null)

    assertNoError(result, 'ConvRepo:getParticipantsWithProfiles')

    return ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => {
      const user = (row['users'] ?? {}) as Record<string, unknown>
      return toParticipantProfile({
        ...row,
        email:        user['email'],
        display_name: null,
        avatar_url:   null,
      })
    })
  },

  // ── Mute / unmute ─────────────────────────────────────────────────────────

  async setMuted(
    conversationId: string,
    userId: string,
    muted: boolean,
  ): Promise<void> {
    const result = await (supabase() as any)
      .from('conversation_participants')
      .update({ is_muted: muted })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .is('left_at', null)

    if (result.error) {
      throw new Error(`[ConvRepo:setMuted] ${result.error.message}`)
    }
  },

  // ── Leave conversation (via RPC for atomic owner transfer) ────────────────

  async leave(conversationId: string, userId: string): Promise<void> {
    const result = await (supabase() as any).rpc('leave_conversation', {
      p_conversation_id: conversationId,
      p_user_id:         userId,
    })
    if (result.error) {
      throw new Error(`[ConvRepo:leave] ${result.error.message}`)
    }
  },

  // ── Unread counts for all of a user's conversations ───────────────────────

  async getUnreadCounts(
    userId: string,
  ): Promise<Map<string, number>> {
    const result = await (supabase() as any).rpc('get_conversation_unread_counts', {
      p_user_id: userId,
    })
    if (result.error) {
      throw new Error(`[ConvRepo:getUnreadCounts] ${result.error.message}`)
    }

    const map = new Map<string, number>()
    const rows = (result.data ?? []) as Array<{ conversation_id: string; unread_count: number }>
    for (const row of rows) {
      map.set(row.conversation_id, Number(row.unread_count))
    }
    return map
  },
}