import { createApp } from './app'
import { config } from './config'
import { getRedis } from './modules/redis/redis.client'
import { startExpireScheduler } from './modules/payment/jobs/payment.job'

const app = createApp()

async function start() {
  try {
    await getRedis().ping()
    console.log('[Redis] Connected')
  } catch (err) {
    console.error('[Redis] Connection failed:', err)
    process.exit(1)
  }

  // Register recurring background jobs
  if (config.env !== 'test') {
    await startExpireScheduler()
  }

  const server = app.listen(config.port, () => {
    console.log(`[Server] Running on port ${config.port} (${config.env})`)
  })

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`[Server] ${signal} received — shutting down gracefully`)
    server.close(async () => {
      getRedis().disconnect()
      console.log('[Server] Closed')
      process.exit(0)
    })
    // Force exit after 10s if connections don't drain
    setTimeout(() => process.exit(1), 10_000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start().catch((err) => {
  console.error('[Server] Failed to start:', err)
  process.exit(1)
})