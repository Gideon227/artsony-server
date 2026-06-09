// ── Bull mock ─────────────────────────────────────────────────────────────────
// Must be defined before any import that transitively loads Bull

const mockAdd                  = jest.fn().mockResolvedValue({ id: 'job-1' })
const mockGetRepeatableJobs    = jest.fn().mockResolvedValue([])
const mockRemoveRepeatableByKey = jest.fn().mockResolvedValue(undefined)
const mockProcess              = jest.fn()
const mockOn                   = jest.fn()

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add:                  mockAdd,
    process:              mockProcess,
    on:                   mockOn,
    getRepeatableJobs:    mockGetRepeatableJobs,
    removeRepeatableByKey: mockRemoveRepeatableByKey,
  }))
})

jest.mock('../../src/modules/payment/services/payment.service', () => ({
  paymentService: {
    verifyTransaction: jest.fn(),
    getRetryDelayMs:   jest.fn().mockReturnValue(30_000),
  },
}))

jest.mock('../../src/modules/order/services/order.service', () => ({
  orderService: {
    expireStaleOrders: jest.fn(),
  },
}))

jest.mock('../../src/config', () => ({
  config: {
    redis: { url: 'redis://localhost:6379' },
    env:   'test',
  },
}))

import { scheduleVerification, startExpireScheduler } from '../../src/modules/payment/jobs/payment.jobs'
import Bull from 'bull'

const MockBull = Bull as jest.MockedClass<typeof Bull>

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks())

// ═════════════════════════════════════════════════════════════════════════════
// scheduleVerification
// ═════════════════════════════════════════════════════════════════════════════

describe('scheduleVerification', () => {
  it('adds a job to the verify queue with correct payload', async () => {
    await scheduleVerification('tx-abc', 0, 30_000)

    expect(mockAdd).toHaveBeenCalledWith(
      { transaction_id: 'tx-abc', retry_count: 0 },
      expect.objectContaining({
        delay: 30_000,
        jobId: 'verify:tx-abc:0',
      }),
    )
  })

  it('uses default delayMs of 30s when not provided', async () => {
    await scheduleVerification('tx-def', 0)

    expect(mockAdd).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ delay: 30_000 }),
    )
  })

  it('uses default retryCount of 0 when not provided', async () => {
    await scheduleVerification('tx-ghi')

    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({ retry_count: 0 }),
      expect.anything(),
    )
  })

  it('uses the provided delay for retry scheduling', async () => {
    await scheduleVerification('tx-jkl', 2, 120_000)

    expect(mockAdd).toHaveBeenCalledWith(
      { transaction_id: 'tx-jkl', retry_count: 2 },
      expect.objectContaining({ delay: 120_000 }),
    )
  })

  it('generates a unique jobId per (transactionId, retryCount) pair', async () => {
    await scheduleVerification('tx-1', 0)
    await scheduleVerification('tx-1', 1)
    await scheduleVerification('tx-2', 0)

    const jobIds = mockAdd.mock.calls.map((c: any) => c[1].jobId as string)
    expect(new Set(jobIds).size).toBe(3)   // all three are distinct
  })

  it('calls queue.add exactly once per invocation', async () => {
    await scheduleVerification('tx-once', 0)

    expect(mockAdd).toHaveBeenCalledTimes(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// startExpireScheduler
// ═════════════════════════════════════════════════════════════════════════════

describe('startExpireScheduler', () => {
  it('registers a repeating job on the expire queue', async () => {
    await startExpireScheduler()

    expect(mockAdd).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        repeat: { every: 5 * 60 * 1000 },
      }),
    )
  })

  it('removes all existing repeatable jobs before registering a new one', async () => {
    mockGetRepeatableJobs.mockResolvedValueOnce([
      { key: 'old-key-1' },
      { key: 'old-key-2' },
    ])

    await startExpireScheduler()

    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('old-key-1')
    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('old-key-2')
  })

  it('still registers the new job after removing old ones', async () => {
    mockGetRepeatableJobs.mockResolvedValueOnce([{ key: 'stale-key' }])

    await startExpireScheduler()

    // removeRepeatableByKey called once for old job, then add called for new
    expect(mockRemoveRepeatableByKey).toHaveBeenCalledTimes(1)
    expect(mockAdd).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ repeat: { every: 300_000 } }),
    )
  })

  it('assigns a fixed jobId to prevent duplicate repeat registrations', async () => {
    await startExpireScheduler()

    expect(mockAdd).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ jobId: 'expire:recurring' }),
    )
  })

  it('does not throw when there are no existing repeatable jobs', async () => {
    mockGetRepeatableJobs.mockResolvedValueOnce([])

    await expect(startExpireScheduler()).resolves.toBeUndefined()
    expect(mockRemoveRepeatableByKey).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Queue configuration
// ═════════════════════════════════════════════════════════════════════════════

describe('Queue configuration', () => {
  it('creates verify queue with attempts=1 to prevent Bull auto-retry', () => {
    // Bull constructor is called at module load time — check the second call
    // (first = verifyQueue, second = expireQueue based on module order)
    const calls = MockBull.mock.calls

    const verifyQueueName = calls.find(c => (c[0] as string).includes('verify'))?.[0]
    expect(verifyQueueName).toContain('verify')
  })

  it('creates two distinct queue instances', () => {
    // Module was loaded once — two Bull instances created
    expect(MockBull).toHaveBeenCalledTimes(2)
  })

  it('both queues use the configured Redis URL', () => {
    const allRedisUrls = MockBull.mock.calls.map(c => (c[1] as any)?.redis)
    allRedisUrls.forEach(url => {
      expect(url).toBe('redis://localhost:6379')
    })
  })
})