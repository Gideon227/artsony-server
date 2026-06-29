import { supabase, assertNoError } from '@/config/database'
import type {
  Message,
  MessageWithSender,
  MessagePreview,
  MessageRead,
  MessageType,
  SenderProfile,
  CursorPage,
  MessageMetadata, // FIX: Imported MessageMetadata
} from '@/common/types'

// ── Mappers ──────────────────────────────────────────────────────────────────

function toMessage(row: Record<string, unknown>): Message {
  return {
    id:                row['id'] as string,
    conversation_id:   row['conversation_id'] as string,
    sender_id:         row['sender_id'] as string,
    body:              row['body'] as string,
    type:              row['type'] as MessageType,
    reply_to_id:       (row['reply_to_id'] as string | null) ?? null,
    // FIX: Cast the incoming JSON directly to MessageMetadata
    metadata:          (row['metadata'] ?? {}) as MessageMetadata,
    is_broadcast_root: row['is_broadcast_root'] as boolean,
    created_at:        new Date(row['created_at'] as string),
    edited_at:         row['edited_at'] ? new Date(row['edited_at'] as string) : null,
    deleted_at:        row['deleted_at'] ? new Date(row['deleted_at'] as string) : null,
  }
}

function toMessageWithSender(row: Record<string, unknown>): MessageWithSender {
  const senderRaw = (row['users'] ?? row['sender'] ?? {}) as Record<string, unknown>
  const sender: SenderProfile = {
    id:           (senderRaw['id'] as string) ?? (row['sender_id'] as string),
    email:        (senderRaw['email'] as string) ?? '',
    display_name: (senderRaw['display_name'] as string | null) ?? null,
    avatar_url:   (senderRaw['avatar_url'] as string | null) ?? null,
  }
  return { ...toMessage(row), sender }
}

function toMessagePreview(row: Record<string, unknown>): MessagePreview {
  return {
    id:         row['id'] as string,
    sender_id:  row['sender_id'] as string,
    body:       row['body'] as string,
    type:       row['type'] as MessageType,
    created_at: new Date(row['created_at'] as string),
    deleted_at: row['deleted_at'] ? new Date(row['deleted_at'] as string) : null,
  }
}

// ── Repository ───────────────────────────────────────────────────────────────

export const messageRepository = {

  // ── Insert a new message ──────────────────────────────────────────────────

  async create(input: {
    conversationId:   string
    senderId:         string
    body:             string
    type:             MessageType
    replyToId:        string | null
    // FIX: Expect strict MessageMetadata instead of Record<string, unknown>
    metadata:         MessageMetadata 
    isBroadcastRoot?: boolean
  }): Promise<Message> {
    const result = await (supabase() as any)
      .from('messages')
      .insert({
        conversation_id:   input.conversationId,
        sender_id:         input.senderId,
        body:              input.body,
        type:              input.type,
        reply_to_id:       input.replyToId,
        metadata:          input.metadata,
        is_broadcast_root: input.isBroadcastRoot ?? false,
      })
      .select('*')
      .single()

    assertNoError(result, 'MessageRepo:create')
    return toMessage(result.data as Record<string, unknown>)
  },

  // ── Find a single message by id ───────────────────────────────────────────

  async findById(id: string): Promise<Message | undefined> {
    const result = await (supabase() as any)
      .from('messages')
      .select('*')
      .eq('id', id)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'MessageRepo:findById')
    return toMessage(result.data as Record<string, unknown>)
  },

  // ── Find a message with sender profile joined ─────────────────────────────

  async findByIdWithSender(id: string): Promise<MessageWithSender | undefined> {
    const result = await (supabase() as any)
      .from('messages')
      .select('*, users!sender_id ( id, email )')
      .eq('id', id)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'MessageRepo:findByIdWithSender')
    return toMessageWithSender(result.data as Record<string, unknown>)
  },

  // ── Paginated message list for a conversation (cursor-based) ──────────────

  async listForConversation(input: {
    conversationId: string
    cursor?:        string
    limit?:         number
  }): Promise<CursorPage<MessageWithSender>> {
    const limit = Math.min(input.limit ?? 30, 50)

    let query = (supabase() as any)
      .from('messages')
      .select('*, users!sender_id ( id, email )')
      .eq('conversation_id', input.conversationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit + 1)

    if (input.cursor) {
      const cursorResult = await (supabase() as any)
        .from('messages')
        .select('created_at')
        .eq('id', input.cursor)
        .single()

      if (!cursorResult.error && cursorResult.data) {
        query = query.lt('created_at', (cursorResult.data as Record<string, unknown>)['created_at'])
      }
    }

    const result = await query
    assertNoError(result, 'MessageRepo:listForConversation')

    const rows = (result.data ?? []) as Array<Record<string, unknown>>
    const hasMore = rows.length > limit
    if (hasMore) rows.pop()

    const items = rows.map(toMessageWithSender)
    const nextCursor = hasMore && items.length > 0
      ? items[items.length - 1]!.id
      : null

    return { items, next_cursor: nextCursor, has_more: hasMore }
  },

  // ── Full-text search within a conversation (via RPC) ──────────────────────

  async search(input: {
    conversationId: string
    userId:         string
    query:          string
    limit?:         number
    cursor?:        string
  }): Promise<MessageWithSender[]> {
    const result = await (supabase() as any).rpc('search_messages', {
      p_conversation_id: input.conversationId,
      p_user_id:         input.userId,
      p_query:           input.query,
      p_limit:           input.limit ?? 20,
      p_before_id:       input.cursor ?? null,
    })

    if (result.error) {
      if (result.error.message?.includes('access denied')) {
        throw new Error('FORBIDDEN')
      }
      throw new Error(`[MessageRepo:search] ${result.error.message}`)
    }

    const rows = (result.data ?? []) as Array<Record<string, unknown>>
    const messages = rows.map(toMessage)

    if (messages.length === 0) return []

    const senderIds = [...new Set(messages.map((m) => m.sender_id))]
    const profilesResult = await (supabase() as any)
      .from('users')
      .select('id, email')
      .in('id', senderIds)

    const profileMap = new Map<string, SenderProfile>()
    if (!profilesResult.error) {
      for (const u of (profilesResult.data ?? []) as Array<Record<string, unknown>>) {
        profileMap.set(u['id'] as string, {
          id:           u['id'] as string,
          email:        u['email'] as string,
          display_name: null,
          avatar_url:   null,
        })
      }
    }

    return messages.map((m) => ({
      ...m,
      sender: profileMap.get(m.sender_id) ?? {
        id:           m.sender_id,
        email:        '',
        display_name: null,
        avatar_url:   null,
      },
    }))
  },

  // ── Edit a message body ───────────────────────────────────────────────────

  async edit(messageId: string, body: string): Promise<Message> {
    const result = await (supabase() as any)
      .from('messages')
      .update({ body, edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .select('*')
      .single()

    assertNoError(result, 'MessageRepo:edit')
    return toMessage(result.data as Record<string, unknown>)
  },

  // ── Soft-delete a message ─────────────────────────────────────────────────

  async softDelete(messageId: string): Promise<void> {
    const result = await (supabase() as any)
      .from('messages')
      .update({
        deleted_at: new Date().toISOString(),
        body:       '[Message deleted]',
        metadata:   {},
      })
      .eq('id', messageId)

    if (result.error) {
      throw new Error(`[MessageRepo:softDelete] ${result.error.message}`)
    }
  },

  // ── Preview of a single message (for inbox last-message display) ──────────

  async getPreview(messageId: string): Promise<MessagePreview | undefined> {
    const result = await (supabase() as any)
      .from('messages')
      .select('id, sender_id, body, type, created_at, deleted_at')
      .eq('id', messageId)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'MessageRepo:getPreview')
    return toMessagePreview(result.data as Record<string, unknown>)
  },

  // ── Batch preview for multiple message ids ────────────────────────────────

  async getPreviews(messageIds: string[]): Promise<Map<string, MessagePreview>> {
    if (messageIds.length === 0) return new Map()

    const result = await (supabase() as any)
      .from('messages')
      .select('id, sender_id, body, type, created_at, deleted_at')
      .in('id', messageIds)

    assertNoError(result, 'MessageRepo:getPreviews')

    const map = new Map<string, MessagePreview>()
    for (const row of (result.data ?? []) as Array<Record<string, unknown>>) {
      map.set(row['id'] as string, toMessagePreview(row))
    }
    return map
  },

  // ── Mark messages read (via RPC — atomic, batch) ──────────────────────────

  async markRead(input: {
    conversationId:   string
    userId:           string
    upToMessageId:    string
  }): Promise<number> {
    const result = await (supabase() as any).rpc('mark_messages_read', {
      p_conversation_id:  input.conversationId,
      p_user_id:          input.userId,
      p_up_to_message_id: input.upToMessageId,
    })
    if (result.error) {
      throw new Error(`[MessageRepo:markRead] ${result.error.message}`)
    }
    return result.data as number
  },

  // ── Get read receipts for a specific message ──────────────────────────────

  async getReadReceipts(messageId: string): Promise<MessageRead[]> {
    const result = await (supabase() as any)
      .from('message_reads')
      .select('*')
      .eq('message_id', messageId)
      .order('read_at', { ascending: true })

    assertNoError(result, 'MessageRepo:getReadReceipts')

    return ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id:         row['id'] as string,
      message_id: row['message_id'] as string,
      user_id:    row['user_id'] as string,
      read_at:    new Date(row['read_at'] as string),
    }))
  },

  // ── Check if a user has read a specific message ───────────────────────────

  async hasRead(messageId: string, userId: string): Promise<boolean> {
    const result = await (supabase() as any)
      .from('message_reads')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .single()

    if (result.error?.code === 'PGRST116') return false
    return !result.error
  },
}