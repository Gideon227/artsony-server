import { createServer } from 'http'
import { createApp } from './app'
import { createWsServer } from './modules/ws/ws.server'
import { closePubSub } from './modules/redis/redis.pubsub'
import { getRedis } from './modules/redis/redis.client'
import { startExpireScheduler } from './modules/payment/jobs/payment.job'
import { config } from './config'

const app = createApp()
const httpServer = createServer(app)

async function start(): Promise<void> {
  // ── Redis connectivity check 
  try {
    await getRedis().ping()
    console.log('[Redis] Connected')
  } catch (err) {
    console.error('[Redis] Connection failed:', err)
    process.exit(1)
  }

  // ── Register recurring background jobs
  // if (config.env !== 'test') {
  //   await startExpireScheduler()
  // }

  // ── Attach WebSocket server
  // Must be called BEFORE httpServer.listen so the upgrade event listener
  // is registered before any connections arrive.
  createWsServer(httpServer)

  // ── Start HTTP server 
  httpServer.listen(config.port, () => {
    console.log(`[Server] HTTP + WS running on port ${config.port} (${config.env})`)
    console.log(`[Server] WebSocket endpoint: ws://localhost:${config.port}/ws`)
  })

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[Server] ${signal} received — shutting down gracefully`)

    // Stop accepting new HTTP and WS connections
    httpServer.close(async () => {
      try {
        // Close Redis pub/sub subscriber cleanly so in-flight messages drain
        await closePubSub()

        // Disconnect the shared Redis client
        getRedis().disconnect()

        console.log('[Server] Closed cleanly')
        process.exit(0)
      } catch (err) {
        console.error('[Server] Error during shutdown:', err)
        process.exit(1)
      }
    })

    // Force-exit after 10s if connections don't drain
    setTimeout(() => {
      console.error('[Server] Forced exit after timeout')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT',  () => void shutdown('SIGINT'))
}

start().catch((err) => {
  console.error('[Server] Failed to start:', err)
  process.exit(1)
})