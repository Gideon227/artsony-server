import Bull, { type Queue, type QueueOptions } from 'bull'
import Redis from 'ioredis'
import { config } from '@/config'

type QueueSettings = Omit<QueueOptions, 'createClient' | 'redis'>
type BullConnection = ReturnType<NonNullable<QueueOptions['createClient']>>

type SharedConnections = {
  client: Redis
  subscriber: Redis
}

const queues = new Set<Queue>()
let shared: SharedConnections | null = null

function connect(label: string): Redis {
  const connection = new Redis(config.redis.url, {
    connectTimeout: 10_000,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
  })

  connection.on('error', (err) => {
    console.error(`[Queue:${label}] Redis error:`, err.message)
  })

  return connection
}

function getShared(): SharedConnections {
  if (!shared) {
    shared = {
      client: connect('client'),
      subscriber: connect('subscriber'),
    }
  }
  return shared
}

export function createQueue<T = unknown>(name: string, settings: QueueSettings = {}): Queue<T> {
  const queue = new Bull<T>(name, {
    ...settings,
    createClient: (type) => {
      const connection = type === 'bclient' ? connect(`bclient:${name}`) : getShared()[type]
      return connection as unknown as BullConnection
    },
  })

  queue.on('error', (err) => {
    console.error(`[Queue:${name}] error:`, err.message)
  })

  queues.add(queue)
  return queue
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([...queues].map((queue) => queue.close()))
  queues.clear()

  if (shared) {
    shared.client.disconnect()
    shared.subscriber.disconnect()
    shared = null
  }
}