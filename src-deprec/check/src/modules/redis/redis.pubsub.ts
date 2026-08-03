import Redis from 'ioredis'
import { config } from '@/config'
import { getRedis } from './redis.client'
import type { RedisPubSubMessage, WsServerEvent } from '@/common/types'

// ─── Channel naming ────────────────────────────────────────────────────────────
// All channels are prefixed with the app key prefix to avoid collisions
// when multiple services share the same Redis instance.
//
// Channel taxonomy:
//   conv:{id}      — events scoped to a specific conversation
//                    (new message, typing, read receipt, participant change)
//   user:{id}      — events scoped to a specific user
//                    (notification, presence, conversation list update)
//   broadcast      — platform-wide events (admin, system announcements)
//
// We use two separate Redis connections:
//   publisher  — the shared getRedis() client used for everything else
//   subscriber — a dedicated client; a subscribed Redis client CANNOT issue
//                commands other than SUBSCRIBE/UNSUBSCRIBE/PSUBSCRIBE/PING.
//                Reusing the main client would block all other Redis calls.

export const PubSubChannels = {
  conversation: (id: string) => `artsony:conv:${id}`,
  user:         (id: string) => `artsony:user:${id}`,
  broadcast:    ()           => `artsony:broadcast`,
} as const

// ─── Subscriber singleton ──────────────────────────────────────────────────────
// One subscriber client per process. Handlers registered via subscribe()
// accumulate in a Map keyed by channel name.

type ChannelHandler = (event: WsServerEvent) => void

let _subscriber: Redis | null = null

function getSubscriber(): Redis {
  if (!_subscriber) {
    // Fresh connection — MUST NOT share the publisher connection
    _subscriber = new Redis(config.redis.url, {
      keyPrefix:          '',          // pub/sub channels must NOT be prefixed
      maxRetriesPerRequest: null,      // subscriber must retry indefinitely
      enableReadyCheck:   true,
      lazyConnect:        false,
      // Reconnect on unexpected disconnects (process restart, network blip)
      reconnectOnError: (err) => {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ECONNREFUSED']
        return targetErrors.some((e) => err.message.includes(e))
      },
    })

    _subscriber.on('error', (err) => {
      console.error('[PubSub:subscriber] Redis error:', err.message)
    })

    _subscriber.on('reconnecting', () => {
      console.warn('[PubSub:subscriber] Reconnecting...')
    })
  }
  return _subscriber
}

// ─── Handler registry ──────────────────────────────────────────────────────────
// Map<channel, Set<handler>> — multiple handlers can subscribe to the same channel.
// This allows the WS gateway and any future consumers to both react to the same event.

const _handlers = new Map<string, Set<ChannelHandler>>()

// Bootstrap the message listener once — routes incoming messages to registered handlers
let _listenerAttached = false

function ensureListener(): void {
  if (_listenerAttached) return
  _listenerAttached = true

  getSubscriber().on('message', (channel: string, raw: string) => {
    const handlers = _handlers.get(channel)
    if (!handlers || handlers.size === 0) return

    let parsed: RedisPubSubMessage
    try {
      parsed = JSON.parse(raw) as RedisPubSubMessage
    } catch {
      console.error('[PubSub] Malformed message on channel:', channel)
      return
    }

    for (const handler of handlers) {
      try {
        handler(parsed.event)
      } catch (err) {
        console.error('[PubSub] Handler threw on channel:', channel, err)
      }
    }
  })

  // Pattern subscribe errors (e.g., permission denied) should be surfaced
  getSubscriber().on('error', (err) => {
    console.error('[PubSub:listener] Error:', err.message)
  })
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Publish an event to a channel.
 * Uses the shared publisher client (getRedis()) — NOT the subscriber.
 *
 * @param channel  Full channel name from PubSubChannels.*
 * @param event    The WsServerEvent to broadcast to all subscribers on this channel
 */
export async function publish(channel: string, event: WsServerEvent): Promise<void> {
  const payload: RedisPubSubMessage = { channel, event }
  try {
    await getRedis().publish(channel, JSON.stringify(payload))
  } catch (err) {
    // Non-fatal — log and continue. The WS delivery is best-effort;
    // clients will reconcile via REST on reconnect.
    console.error('[PubSub] publish failed on channel:', channel, err)
  }
}

/**
 * Subscribe to a channel and register a handler.
 * Safe to call multiple times with the same channel and different handlers.
 * Returns an unsubscribe function for clean teardown.
 */
export async function subscribe(
  channel: string,
  handler: ChannelHandler,
): Promise<() => Promise<void>> {
  ensureListener()

  // Register handler before subscribing so we never miss a message
  // in the window between subscribe() and the 'message' event being attached
  if (!_handlers.has(channel)) {
    _handlers.set(channel, new Set())
  }
  _handlers.get(channel)!.add(handler)

  // Only issue SUBSCRIBE if this is the first handler for this channel
  if (_handlers.get(channel)!.size === 1) {
    await getSubscriber().subscribe(channel)
  }

  // Return unsubscribe cleanup function
  return async () => {
    const handlers = _handlers.get(channel)
    if (!handlers) return

    handlers.delete(handler)

    // Only issue UNSUBSCRIBE when the last handler is removed
    if (handlers.size === 0) {
      _handlers.delete(channel)
      try {
        await getSubscriber().unsubscribe(channel)
      } catch (err) {
        console.error('[PubSub] unsubscribe failed on channel:', channel, err)
      }
    }
  }
}

/**
 * Subscribe to all events for a conversation.
 * Convenience wrapper used by the WS gateway when a client joins a conversation.
 */
export async function subscribeToConversation(
  conversationId: string,
  handler: ChannelHandler,
): Promise<() => Promise<void>> {
  return subscribe(PubSubChannels.conversation(conversationId), handler)
}

/**
 * Subscribe to all events for a user (notifications, presence, inbox updates).
 */
export async function subscribeToUser(
  userId: string,
  handler: ChannelHandler,
): Promise<() => Promise<void>> {
  return subscribe(PubSubChannels.user(userId), handler)
}

/**
 * Publish an event to a conversation channel.
 * Called by message.service after persisting a message.
 */
export async function publishToConversation(
  conversationId: string,
  event: WsServerEvent,
): Promise<void> {
  return publish(PubSubChannels.conversation(conversationId), event)
}

/**
 * Publish an event to a user's personal channel.
 * Called by notification.service when generating a notification.
 */
export async function publishToUser(
  userId: string,
  event: WsServerEvent,
): Promise<void> {
  return publish(PubSubChannels.user(userId), event)
}

/**
 * Gracefully close the subscriber connection.
 * Called during server shutdown to allow in-flight messages to drain.
 */
export async function closePubSub(): Promise<void> {
  if (_subscriber) {
    await _subscriber.quit()
    _subscriber = null
    _listenerAttached = false
    _handlers.clear()
  }
}

// ─── Typing indicator helpers (Redis TTL-based, NOT persisted to DB) ──────────
//
// Typing state is entirely ephemeral. We use Redis SETEX with a 5-second TTL.
// If the client doesn't send typing:stop within 5s, the indicator auto-expires.
// The WS gateway reads from Redis to determine the current typing state when
// a new client connects to a conversation (avoids stale typing indicators).

const TYPING_TTL_SECONDS = 5

export async function setTyping(
  conversationId: string,
  userId: string,
  displayName: string | null,
): Promise<void> {
  const key = `artsony:typing:${conversationId}:${userId}`
  const value = JSON.stringify({ userId, displayName, started_at: Date.now() })
  await getRedis().setex(key, TYPING_TTL_SECONDS, value)
}

export async function clearTyping(
  conversationId: string,
  userId: string,
): Promise<void> {
  const key = `artsony:typing:${conversationId}:${userId}`
  await getRedis().del(key)
}

export async function getTypingUsers(conversationId: string): Promise<
  Array<{ userId: string; displayName: string | null; started_at: number }>
> {
  const pattern = `artsony:typing:${conversationId}:*`
  const keys = await getRedis().keys(pattern)
  if (keys.length === 0) return []

  const values = await getRedis().mget(...keys)
  return values
    .filter((v): v is string => v !== null)
    .map((v) => JSON.parse(v) as { userId: string; displayName: string | null; started_at: number })
}

// ─── Online presence helpers ───────────────────────────────────────────────────
//
// We track online presence in Redis with a 35-second TTL.
// The WS gateway refreshes this key on every heartbeat (every 25s).
// If a heartbeat is missed, the key expires and the user appears offline.
// On disconnect, we explicitly delete the key for immediate offline status.

const PRESENCE_TTL_SECONDS = 35

export async function setUserOnline(userId: string): Promise<void> {
  const key = `artsony:presence:${userId}`
  await getRedis().setex(key, PRESENCE_TTL_SECONDS, '1')
}

export async function setUserOffline(userId: string): Promise<void> {
  const key = `artsony:presence:${userId}`
  await getRedis().del(key)
}

export async function refreshPresence(userId: string): Promise<void> {
  const key = `artsony:presence:${userId}`
  await getRedis().expire(key, PRESENCE_TTL_SECONDS)
}

export async function isUserOnline(userId: string): Promise<boolean> {
  const key = `artsony:presence:${userId}`
  const result = await getRedis().exists(key)
  return result === 1
}

export async function getOnlineUserIds(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return []
  const keys = userIds.map((id) => `artsony:presence:${id}`)
  const pipeline = getRedis().pipeline()
  keys.forEach((k) => pipeline.exists(k))
  const results = await pipeline.exec()
  return userIds.filter((_, i) => results?.[i]?.[1] === 1)
}

// ─── Message idempotency ───────────────────────────────────────────────────────
// Prevents duplicate messages when a client reconnects and resends
// an unacknowledged message. Key expires after 24h — enough to cover
// any reasonable reconnection window.

const IDEMPOTENCY_TTL = 86_400 // 24 hours

export async function checkAndSetIdempotency(
  clientMessageId: string,
  persistedMessageId: string,
): Promise<{ isDuplicate: boolean; existingId: string | null }> {
  const key = `artsony:msg:idem:${clientMessageId}`
  // SET NX — only sets if the key does NOT exist
  const set = await getRedis().set(key, persistedMessageId, 'EX', IDEMPOTENCY_TTL, 'NX')
  if (set === null) {
    // Key already existed — this is a duplicate send
    const existingId = await getRedis().get(key)
    return { isDuplicate: true, existingId }
  }
  return { isDuplicate: false, existingId: null }
}

// ─── WS rate limiting ──────────────────────────────────────────────────────────
// Per-user message rate limiting over WebSocket.
// Separate from the HTTP rate limiter (rate-limit.middleware.ts).
// 60 messages per 60-second sliding window.

const WS_RATE_LIMIT  = 60
const WS_RATE_WINDOW = 60  // seconds

export async function checkWsRateLimit(userId: string): Promise<{
  allowed: boolean
  remaining: number
  resetIn: number
}> {
  const key    = `artsony:wsrl:${userId}`
  const redis  = getRedis()
  const now    = Date.now()
  const window = now - WS_RATE_WINDOW * 1000

  // Sorted set: score = timestamp, member = timestamp:random
  // ZREMRANGEBYSCORE removes entries outside the window
  // ZADD adds the current request
  // ZCARD returns total count in window
  const pipeline = redis.pipeline()
  pipeline.zremrangebyscore(key, '-inf', window)
  pipeline.zadd(key, now, `${now}:${Math.random()}`)
  pipeline.zcard(key)
  pipeline.pttl(key)
  const results = await pipeline.exec()

  const count    = (results?.[2]?.[1] as number) ?? 0
  const ttl      = (results?.[3]?.[1] as number) ?? -1
  const allowed  = count <= WS_RATE_LIMIT
  const remaining = Math.max(0, WS_RATE_LIMIT - count)
  const resetIn   = ttl > 0 ? Math.ceil(ttl / 1000) : WS_RATE_WINDOW

  // Set TTL on first request in window
  if (count === 1) {
    await redis.expire(key, WS_RATE_WINDOW)
  }

  return { allowed, remaining, resetIn }
}