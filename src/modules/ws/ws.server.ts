import { WebSocketServer, WebSocket } from 'ws'
import type { Server as HttpServer } from 'http'
import type { IncomingMessage } from 'http'
import { parse as parseUrl } from 'url'
import { verifyAccessToken } from '@/modules/auth/services/token.service'
import { userRepository } from '@/modules/auth/repositories/user.repository'
import { connectionManager } from './connection-manager'
import { eventRouter } from './event-router'
import { setUserOnline, setUserOffline, refreshPresence, publishToUser } from '@/modules/redis/redis.pubsub'
import type { WsClient, WsServerEvent } from '@/common/types'

// ─── Constants ─────────────────────────────────────────────────────────────────
const HEARTBEAT_INTERVAL_MS  = 25_000   // ping every 25s
const HEARTBEAT_TIMEOUT_MS   = 60_000   // disconnect if no pong within 60s
const TOKEN_RECHECK_INTERVAL = 5 * 60 * 1000  // re-validate token every 5 min

let _wss: WebSocketServer | null = null

// ─── Bootstrap ─────────────────────────────────────────────────────────────────
/**
 * Attach the WebSocket server to the existing HTTP server.
 * Call this ONCE from server.ts after app.listen() resolves.
 *
 * We use { noServer: true } so we control the upgrade handshake ourselves —
 * this lets us authenticate BEFORE the WebSocket connection is established.
 * If auth fails we can return a proper HTTP 401 rather than opening a socket
 * and then immediately closing it.
 */
export function createWsServer(httpServer: HttpServer): WebSocketServer {
  if (_wss) return _wss

  _wss = new WebSocketServer({ noServer: true })

  // ── Upgrade handler ─────────────────────────────────────────────────────────
  httpServer.on('upgrade', async (req: IncomingMessage, socket, head) => {
    // Only handle /ws upgrades — pass everything else through
    const { pathname } = parseUrl(req.url ?? '')
    if (pathname !== '/ws') {
      socket.destroy()
      return
    }

    let wsClient: WsClient

    try {
      wsClient = await authenticate(req)
    } catch (err) {
      // Reject with HTTP 401 before completing the WebSocket handshake
      const msg = err instanceof Error ? err.message : 'Unauthorized'
      socket.write(
        `HTTP/1.1 401 Unauthorized\r\n` +
        `Content-Type: text/plain\r\n` +
        `Content-Length: ${Buffer.byteLength(msg)}\r\n` +
        `\r\n${msg}`,
      )
      socket.destroy()
      return
    }

    _wss!.handleUpgrade(req, socket, head, (ws) => {
      // Copy our auth properties onto the raw ws instance to create a WsClient
      const client = ws as WsClient
      client.userId       = wsClient.userId
      client.sessionId    = wsClient.sessionId
      client.tokenVersion = wsClient.tokenVersion
      client.role         = wsClient.role
      client.isAlive      = true
      client.connectedAt  = new Date()
      client.subscriptions = new Set()

      _wss!.emit('connection', client, req)
    })
  })

  // ── Connection handler ──────────────────────────────────────────────────────
  _wss.on('connection', async (client: WsClient) => {
    // Register in the connection manager
    connectionManager.add(client)

    // Mark user online in Redis and notify their contacts
    await setUserOnline(client.userId)
    await publishToUser(client.userId, {
      event:   'user:online',
      user_id: client.userId,
    })

    // ── Incoming message handler ───────────────────────────────────────────
    client.on('message', async (raw: Buffer) => {
      // Reset liveness on any incoming message (not just pong)
      client.isAlive = true

      let parsed: unknown
      try {
        parsed = JSON.parse(raw.toString())
      } catch {
        sendToClient(client, {
          event:   'error',
          code:    'INVALID_EVENT',
          message: 'Message must be valid JSON',
        })
        return
      }

      await eventRouter.handle(client, parsed)
    })

    // ── Pong handler ────────────────────────────────────────────────────────
    client.on('pong', async () => {
      client.isAlive = true
      // Refresh presence TTL on every heartbeat
      await refreshPresence(client.userId)
    })

    // ── Close handler ───────────────────────────────────────────────────────
    client.on('close', async () => {
      connectionManager.remove(client)

      // Only mark offline if this was their LAST connection
      // (user might have multiple tabs open)
      if (!connectionManager.hasConnections(client.userId)) {
        await setUserOffline(client.userId)
        await publishToUser(client.userId, {
          event:   'user:offline',
          user_id: client.userId,
        })
      }
    })

    // ── Error handler ───────────────────────────────────────────────────────
    client.on('error', (err) => {
      console.error(`[WS] Socket error for user ${client.userId}:`, err.message)
      // The 'close' event will fire automatically after an error
    })
  })

  // ── Heartbeat interval ──────────────────────────────────────────────────────
  // Every 25s, ping all connections. Any client that didn't respond to the
  // previous ping (isAlive === false) is terminated.
  const heartbeatTimer = setInterval(() => {
    _wss!.clients.forEach((ws) => {
      const client = ws as WsClient
      if (!client.isAlive) {
        // Missed a heartbeat — terminate ungracefully
        client.terminate()
        return
      }
      client.isAlive = false
      client.ping()
    })
  }, HEARTBEAT_INTERVAL_MS)

  // ── Periodic token re-validation ────────────────────────────────────────────
  // Every 5 minutes, verify each connected client's token version against DB.
  // This ensures that a password change or forced logout takes effect even
  // on active WebSocket connections without waiting for the next request.
  const tokenCheckTimer = setInterval(async () => {
    const clients = Array.from(_wss!.clients) as WsClient[]
    await Promise.allSettled(
      clients.map(async (client) => {
        try {
          const user = await userRepository.findById(client.userId)
          if (!user || user.status !== 'ACTIVE' || user.token_version !== client.tokenVersion) {
            sendToClient(client, {
              event:   'error',
              code:    'UNAUTHORIZED',
              message: 'Session invalidated',
            })
            client.terminate()
          }
        } catch {
          // Non-fatal — skip this client on this cycle
        }
      }),
    )
  }, TOKEN_RECHECK_INTERVAL)

  _wss.on('close', () => {
    clearInterval(heartbeatTimer)
    clearInterval(tokenCheckTimer)
  })

  console.log('[WS] Server attached to HTTP server at /ws')
  return _wss
}

// ─── Auth handshake ────────────────────────────────────────────────────────────
// Extract the access token from the Authorization header or ?token= query param.
// Query param support is required because browser WebSocket API does not allow
// custom headers — the token must be passed as a query parameter from the client.
//
// Security note: the token in the query string will appear in server access logs.
// Mitigate by: using HTTPS (encrypts the URL), short-lived access tokens (15min),
// and not logging the full URL in production.

async function authenticate(req: IncomingMessage): Promise<WsClient> {
  const { query } = parseUrl(req.url ?? '', true)
  const tokenFromQuery  = query['token'] as string | undefined
  const tokenFromHeader = req.headers['authorization']?.replace('Bearer ', '')
  const token = tokenFromQuery ?? tokenFromHeader

  if (!token) {
    throw new Error('Missing access token')
  }

  // Verify JWT signature and expiry
  let payload: Awaited<ReturnType<typeof verifyAccessToken>>
  try {
    payload = await verifyAccessToken(token)
  } catch {
    throw new Error('Invalid or expired token')
  }

  // Verify the user exists and token version matches (catches invalidated sessions)
  const user = await userRepository.findById(payload.sub)
  if (!user || user.status !== 'ACTIVE') {
    throw new Error('Account unavailable')
  }
  if (user.token_version !== payload.ver) {
    throw new Error('Session invalidated')
  }

  // Return a partial WsClient — the caller will attach this to the ws instance
  return {
    userId:       payload.sub,
    sessionId:    payload.sid,
    tokenVersion: payload.ver,
    role:         payload.role,
  } as WsClient
}

// ─── Send helper ───────────────────────────────────────────────────────────────
/**
 * Send a typed event to a single WebSocket client.
 * Silently drops if the socket is not in OPEN state.
 */
export function sendToClient(client: WebSocket, event: WsServerEvent): void {
  if (client.readyState !== WebSocket.OPEN) return
  try {
    client.send(JSON.stringify(event))
  } catch (err) {
    console.error('[WS] sendToClient failed:', err)
  }
}

export function getWss(): WebSocketServer | null {
  return _wss
}