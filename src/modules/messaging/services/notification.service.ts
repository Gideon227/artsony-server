import { supabase } from '@/config/database'
import { connectionManager } from '@/modules/ws/connection-manager'
import { getRedis } from '@/modules/redis/redis.client'
import type {
  MessageWithSender,
  NotificationType,
  WsNotificationPayload,
} from '@/common/types'

// ─── NotificationService ──────────────────────────────────────────────────────
// Owns all notification creation and delivery.
// Extends the existing notifications table (001_initial_schema.sql) with the
// new message/broadcast/mention types added by the messaging migration.

export const notificationService = {

  // ── Create notifications for a received message ───────────────────────────
  // Called by broadcastService for offline participants only.
  // Online participants receive the WS event directly — no notification row.

  async createMessageNotifications(input: {
    message:      MessageWithSender
    recipientIds: string[]
  }): Promise<void> {
    if (input.recipientIds.length === 0) return

    const type: NotificationType =
      input.message.is_broadcast_root ? 'broadcast' : 'message'

    const rows = input.recipientIds.map((recipientId) => ({
      recipient_id: recipientId,
      actor_id:     input.message.sender_id,
      type,
      entity_id:    input.message.id,
      entity_type:  'message',
      data: {
        conversation_id: input.message.conversation_id,
        preview:         buildPreview(input.message.body),
        sender_email:    input.message.sender.email,
      },
      is_read: false,
    }))

    // Batch insert — single round-trip for all recipients
    const { error } = await (supabase() as any)
      .from('notifications')
      .insert(rows)

    if (error) {
      console.error('[NotificationService] Batch insert failed:', error.message)
      return
    }

    // Increment unread badge count in Redis for each recipient
    // and deliver a WS notification:new event to any instance where
    // the recipient might have connected in the meantime.
    await Promise.allSettled(
      input.recipientIds.map(async (recipientId) => {
        await getRedis().incr(`artsony:notif:${recipientId}:unread`)

        const wsPayload: WsNotificationPayload = {
          id:          '',    // not critical for real-time display
          type,
          entity_id:   input.message.id,
          entity_type: 'message',
          actor: {
            id:           input.message.sender_id,
            email:        input.message.sender.email,
            display_name: input.message.sender.display_name,
            avatar_url:   input.message.sender.avatar_url,
          },
          data: {
            conversation_id: input.message.conversation_id,
            preview:         buildPreview(input.message.body),
          },
          created_at: new Date().toISOString(),
        }

        await connectionManager.deliverToUserGlobal(recipientId, {
          event:        'notification:new',
          notification: wsPayload,
        })
      }),
    )
  },

  // ── Create a single notification for any social event ────────────────────
  // Used by other services (like/comment/follow — out of scope for this
  // feature but leaving the hook here so the pattern is established).

  async create(input: {
    recipientId:  string
    actorId:      string | null
    type:         NotificationType
    entityId:     string | null
    entityType:   string | null
    data?:        Record<string, unknown>
  }): Promise<void> {
    const { error, data } = await (supabase() as any)
      .from('notifications')
      .insert({
        recipient_id: input.recipientId,
        actor_id:     input.actorId,
        type:         input.type,
        entity_id:    input.entityId,
        entity_type:  input.entityType,
        data:         input.data ?? {},
        is_read:      false,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[NotificationService] create failed:', error.message)
      return
    }

    // Increment Redis badge
    await getRedis().incr(`artsony:notif:${input.recipientId}:unread`)

    // Deliver via WS
    const wsPayload: WsNotificationPayload = {
      id:          (data as { id: string }).id,
      type:        input.type,
      entity_id:   input.entityId,
      entity_type: input.entityType,
      actor:       null,
      data:        input.data ?? {},
      created_at:  new Date().toISOString(),
    }

    await connectionManager.deliverToUserGlobal(input.recipientId, {
      event:        'notification:new',
      notification: wsPayload,
    })
  },

  // ── List notifications for a user (paginated) ─────────────────────────────

  async list(input: {
    userId:     string
    cursor?:    string    // created_at ISO string
    limit?:     number
    unreadOnly?: boolean
  }) {
    const limit = Math.min(input.limit ?? 20, 50)

    let query = (supabase() as any)
      .from('notifications')
      .select('*')
      .eq('recipient_id', input.userId)
      .order('created_at', { ascending: false })
      .limit(limit + 1)

    if (input.cursor) {
      query = query.lt('created_at', input.cursor)
    }
    if (input.unreadOnly) {
      query = query.eq('is_read', false)
    }

    const result = await query
    if (result.error) {
      throw new Error(`[NotificationService:list] ${result.error.message}`)
    }

    const rows = (result.data ?? []) as Array<Record<string, unknown>>
    const hasMore = rows.length > limit
    if (hasMore) rows.pop()

    const nextCursor = hasMore && rows.length > 0
      ? rows[rows.length - 1]!['created_at'] as string
      : null

    return {
      items: rows.map(toNotification),
      next_cursor: nextCursor,
      has_more: hasMore,
    }
  },

  // ── Mark a single notification as read ───────────────────────────────────

  async markRead(notificationId: string, userId: string): Promise<void> {
    const { error } = await (supabase() as any)
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('recipient_id', userId)  // scoped to the user — no cross-user mutation

    if (error) {
      throw new Error(`[NotificationService:markRead] ${error.message}`)
    }

    // Decrement Redis badge — floor at 0
    const key   = `artsony:notif:${userId}:unread`
    const count = await getRedis().get(key)
    if (count && parseInt(count, 10) > 0) {
      await getRedis().decr(key)
    }
  },

  // ── Mark all notifications as read ───────────────────────────────────────

  async markAllRead(userId: string): Promise<void> {
    const { error } = await (supabase() as any)
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', userId)
      .eq('is_read', false)

    if (error) {
      throw new Error(`[NotificationService:markAllRead] ${error.message}`)
    }

    // Reset Redis badge to 0
    await getRedis().set(`artsony:notif:${userId}:unread`, '0')
  },

  // ── Get unread notification count ─────────────────────────────────────────

  async getUnreadCount(userId: string): Promise<number> {
    // Serve from Redis cache — the badge counter is maintained incrementally
    const cached = await getRedis().get(`artsony:notif:${userId}:unread`)
    if (cached !== null) return Math.max(0, parseInt(cached, 10))

    // Cache miss — query DB and repopulate
    const { count, error } = await (supabase() as any)
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('is_read', false)

    if (error) {
      console.error('[NotificationService:getUnreadCount]', error.message)
      return 0
    }

    const total = count ?? 0
    await getRedis().setex(`artsony:notif:${userId}:unread`, 300, String(total))
    return total
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPreview(body: string, maxLen = 80): string {
  return body.length > maxLen ? `${body.slice(0, maxLen).trimEnd()}…` : body
}

function toNotification(row: Record<string, unknown>) {
  return {
    id:          row['id'] as string,
    type:        row['type'] as NotificationType,
    entity_id:   (row['entity_id'] as string | null) ?? null,
    entity_type: (row['entity_type'] as string | null) ?? null,
    actor_id:    (row['actor_id'] as string | null) ?? null,
    data:        (row['data'] as Record<string, unknown>) ?? {},
    is_read:     row['is_read'] as boolean,
    created_at:  new Date(row['created_at'] as string),
  }
}