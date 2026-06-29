import { conversationRepository } from '../repositories/conversation.repository'
import { notificationService } from './notification.service'
import { connectionManager } from '@/modules/ws/connection-manager'
import { isUserOnline } from '@/modules/redis/redis.pubsub'
import type { MessageWithSender } from '@/common/types'

// ─── BroadcastService ─────────────────────────────────────────────────────────
// Responsible for ONE thing: taking a persisted message and ensuring every
// participant receives it — either via WebSocket (online) or notification (offline).
//
// This runs AFTER the message is persisted. It never touches the DB for the
// message itself — only reads participant lists and writes notifications.

export const broadcastService = {

  // ── Fan-out a message to all conversation participants ────────────────────
  // Called by messageService.send() after every successful message insert.
  //
  // Delivery strategy:
  //   Online participants  → WS event via Redis pub/sub (connectionManager)
  //   Offline participants → notification record (notificationService)
  //
  // We deliberately do NOT double-notify online users with both a WS event
  // and a notification. The notification badge count is driven only by the
  // notification table; online users get real-time updates instead.

  async fanOutMessage(
    message:         MessageWithSender,
    clientMessageId: string,
  ): Promise<void> {
    const participantIds = await conversationRepository.getParticipantIds(
      message.conversation_id,
    )

    // Deliver to the conversation channel — Redis pub/sub ensures every instance
    // that has subscribers for this conversation receives and delivers it.
    await connectionManager.deliverToConversationGlobal(message.conversation_id, {
      event:             'message:new',
      conversation_id:   message.conversation_id,
      message,
      client_message_id: clientMessageId,
    })

    // For each participant who is NOT the sender, check online status and
    // create a notification for offline users.
    const recipientIds = participantIds.filter((id) => id !== message.sender_id)

    // Check online status in batch
    const onlineStatuses = await Promise.all(
      recipientIds.map(async (id) => ({
        userId:   id,
        isOnline: await isUserOnline(id),
      })),
    )

    // Create notifications for offline participants only
    const offlineIds = onlineStatuses
      .filter((s) => !s.isOnline)
      .map((s) => s.userId)

    if (offlineIds.length > 0) {
      await notificationService.createMessageNotifications({
        message,
        recipientIds: offlineIds,
      })
    }
  },

  // ── Fan-out a broadcast message to all recipients ─────────────────────────
  // For large broadcasts (500+ recipients) this is called from a Bull queue
  // worker in batches. For smaller broadcasts it runs inline.
  //
  // The conversation channel covers WS delivery. Notifications are created
  // for all offline recipients.

  async fanOutBroadcast(
    message:         MessageWithSender,
    clientMessageId: string,
    recipientIds:    string[],
  ): Promise<void> {
    // WS delivery to the conversation channel (same as direct)
    await connectionManager.deliverToConversationGlobal(message.conversation_id, {
      event:             'message:new',
      conversation_id:   message.conversation_id,
      message,
      client_message_id: clientMessageId,
    })

    // For broadcasts, we notify ALL recipients (not just offline) because the
    // sender expects delivery confirmation — but we skip WS-connected users
    // to avoid redundant notifications on the badge count.
    const BATCH_SIZE = 100

    for (let i = 0; i < recipientIds.length; i += BATCH_SIZE) {
      const batch = recipientIds.slice(i, i + BATCH_SIZE)

      const onlineStatuses = await Promise.all(
        batch.map(async (id) => ({
          userId:   id,
          isOnline: await isUserOnline(id),
        })),
      )

      const offlineIds = onlineStatuses
        .filter((s) => !s.isOnline)
        .map((s) => s.userId)

      if (offlineIds.length > 0) {
        await notificationService.createMessageNotifications({
          message,
          recipientIds: offlineIds,
        })
      }
    }
  },
}