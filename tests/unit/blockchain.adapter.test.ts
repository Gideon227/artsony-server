import { TronAdapter, EthereumAdapter, BscAdapter, getBlockchainAdapter } from '../../src/modules/payment/adapters/blockchain.adapter'

// ── fetch mock ────────────────────────────────────────────────────────────────

const mockFetch = jest.fn()
global.fetch = mockFetch

function mockResponse(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  }
}

beforeEach(() => jest.clearAllMocks())

// ── TRON response builders ────────────────────────────────────────────────────

const TRON_USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'

function makeTronSuccess(amountUsdt: number, recipientSuffix: string) {
  const amountHex = (BigInt(Math.round(amountUsdt * 1_000_000))).toString(16).padStart(64, '0')
  return {
    ret:         [{ contractRet: 'SUCCESS' }],
    blockNumber: 12345,
    log: [{
      address: TRON_USDT,
      topics:  ['0xddf252...', '0x...sender', '0x' + '0'.repeat(24) + recipientSuffix],
      data:    amountHex,
    }],
  }
}

// ── ETH / BSC response builders ───────────────────────────────────────────────

const ETH_USDT    = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

function makeEthSuccess(amountUsdt: number, recipient: string) {
  const amountHex = '0x' + BigInt(Math.round(amountUsdt * 1_000_000)).toString(16).padStart(64, '0')
  const paddedRecipient = '0x' + '0'.repeat(24) + recipient.slice(2)
  return {
    result: {
      status:      '0x1',
      blockNumber: '0x3039',
      logs: [{
        address: ETH_USDT,
        topics:  [TRANSFER_TOPIC, '0x...sender', paddedRecipient],
        data:    amountHex,
      }],
    },
  }
}

function makeBscSuccess(amountUsdt: number, recipient: string) {
  const amountHex = '0x' + BigInt(Math.round(amountUsdt * 1e18)).toString(16).padStart(64, '0')
  const paddedRecipient = '0x' + '0'.repeat(24) + recipient.slice(2)
  const BSC_USDT = '0x55d398326f99059fF775485246999027B3197955'
  return {
    result: {
      status:      '0x1',
      blockNumber: '0x61A8',
      logs: [{
        address: BSC_USDT,
        topics:  [TRANSFER_TOPIC, '0x...sender', paddedRecipient],
        data:    amountHex,
      }],
    },
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TronAdapter
// ═════════════════════════════════════════════════════════════════════════════

describe('TronAdapter.verifyTransaction', () => {
  const adapter   = new TronAdapter()
  const txHash    = 'a'.repeat(64)
  const recipient = 'abcdef1234567890abcdef1234567890abcdef12'
  const amount    = 100

  it('returns confirmed=true with block and amount for a valid TRON USDT transfer', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, makeTronSuccess(amount, recipient)))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result.confirmed).toBe(true)
    if (result.confirmed) {
      expect(result.block).toBe(12345)
      expect(result.amount).toBeCloseTo(amount, 1)
    }
  })

  it('returns NOT_FOUND for HTTP 404', async () => {
    mockFetch.mockResolvedValue(mockResponse(404, {}, false))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'NOT_FOUND' })
  })

  it('returns FAILED for non-200 non-404 HTTP error', async () => {
    mockFetch.mockResolvedValue(mockResponse(500, {}, false))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'FAILED' })
  })

  it('returns PENDING when receipt is missing (transaction not yet mined)', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, { ret: [], log: [] }))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'PENDING' })
  })

  it('returns FAILED when contractRet is not SUCCESS', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, {
      ret:  [{ contractRet: 'REVERT' }],
      log:  [],
    }))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'FAILED' })
  })

  it('returns NOT_FOUND when no USDT transfer log found', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, {
      ret:  [{ contractRet: 'SUCCESS' }],
      log:  [{ address: 'some-other-contract', topics: [], data: '00' }],
    }))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'NOT_FOUND' })
  })

  it('returns WRONG_AMOUNT when transfer amount differs by more than 0.01 USDT', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, makeTronSuccess(50, recipient)))

    const result = await adapter.verifyTransaction(txHash, 100, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'WRONG_AMOUNT' })
  })

  it('confirms when amount differs by less than 0.01 USDT (rounding tolerance)', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, makeTronSuccess(100.005, recipient)))

    const result = await adapter.verifyTransaction(txHash, 100, recipient)

    expect(result.confirmed).toBe(true)
  })

  it('returns FAILED when fetch throws (network timeout)', async () => {
    mockFetch.mockRejectedValue(new Error('AbortError'))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'FAILED' })
  })

  it('returns WRONG_RECIPIENT when recipient hex suffix is missing from topics', async () => {
    const body = {
      ret:         [{ contractRet: 'SUCCESS' }],
      blockNumber: 999,
      log: [{
        address: TRON_USDT,
        topics:  ['0xddf252...', '0x...sender'],  // missing topics[2]
        data:    (100n * 1_000_000n).toString(16).padStart(64, '0'),
      }],
    }
    mockFetch.mockResolvedValue(mockResponse(200, body))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'WRONG_RECIPIENT' })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// EthereumAdapter
// ═════════════════════════════════════════════════════════════════════════════

describe('EthereumAdapter.verifyTransaction', () => {
  const adapter   = new EthereumAdapter()
  const txHash    = 'b'.repeat(64)
  const recipient = '0xabcdef1234567890abcdef1234567890abcdef12'
  const amount    = 50

  it('returns confirmed=true with block for a valid ETH USDT transfer', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, makeEthSuccess(amount, recipient)))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result.confirmed).toBe(true)
    if (result.confirmed) {
      expect(result.block).toBe(12345)    // 0x3039 = 12345
      expect(result.amount).toBeCloseTo(amount, 1)
    }
  })

  it('returns FAILED for HTTP error', async () => {
    mockFetch.mockResolvedValue(mockResponse(503, {}, false))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'FAILED' })
  })

  it('returns NOT_FOUND when result is null/undefined in response', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, { result: undefined }))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'NOT_FOUND' })
  })

  it('returns FAILED when tx status is 0x0 (reverted)', async () => {
    const body = makeEthSuccess(amount, recipient)
    body.result.status = '0x0'
    mockFetch.mockResolvedValue(mockResponse(200, body))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'FAILED' })
  })

  it('returns NOT_FOUND when no matching USDT transfer log exists', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, {
      result: {
        status:      '0x1',
        blockNumber: '0x1',
        logs:        [{ address: '0xsomeother', topics: [TRANSFER_TOPIC], data: '0x00' }],
      },
    }))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'NOT_FOUND' })
  })

  it('returns WRONG_RECIPIENT when log recipient does not match expected', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, makeEthSuccess(amount, '0xdifferentaddress0000000000000000000000000')))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'WRONG_RECIPIENT' })
  })

  it('returns WRONG_AMOUNT when amount differs by more than 0.01', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, makeEthSuccess(1, recipient)))

    const result = await adapter.verifyTransaction(txHash, 100, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'WRONG_AMOUNT' })
  })

  it('returns FAILED when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'FAILED' })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// BscAdapter
// ═════════════════════════════════════════════════════════════════════════════

describe('BscAdapter.verifyTransaction', () => {
  const adapter   = new BscAdapter()
  const txHash    = 'c'.repeat(64)
  const recipient = '0xabcdef1234567890abcdef1234567890abcdef12'
  const amount    = 200

  it('returns confirmed=true for a valid BSC USDT transfer', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, makeBscSuccess(amount, recipient)))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result.confirmed).toBe(true)
    if (result.confirmed) {
      expect(result.block).toBe(25000)   // 0x61A8 = 25000
    }
  })

  it('correctly decodes BSC amounts using 18 decimal places', async () => {
    // 200 USDT on BSC = 200 * 10^18
    mockFetch.mockResolvedValue(mockResponse(200, makeBscSuccess(200, recipient)))

    const result = await adapter.verifyTransaction(txHash, 200, recipient)

    expect(result.confirmed).toBe(true)
    if (result.confirmed) {
      expect(result.amount).toBeCloseTo(200, 0)
    }
  })

  it('returns WRONG_AMOUNT when BSC USDT amount is wrong', async () => {
    mockFetch.mockResolvedValue(mockResponse(200, makeBscSuccess(1, recipient)))

    const result = await adapter.verifyTransaction(txHash, 200, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'WRONG_AMOUNT' })
  })

  it('returns FAILED when fetch throws', async () => {
    mockFetch.mockRejectedValue(new TypeError('network error'))

    const result = await adapter.verifyTransaction(txHash, amount, recipient)

    expect(result).toEqual({ confirmed: false, reason: 'FAILED' })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// Factory
// ═════════════════════════════════════════════════════════════════════════════

describe('getBlockchainAdapter', () => {
  it('returns TronAdapter for TRON', () => {
    expect(getBlockchainAdapter('TRON')).toBeInstanceOf(TronAdapter)
  })

  it('returns EthereumAdapter for ETHEREUM', () => {
    expect(getBlockchainAdapter('ETHEREUM')).toBeInstanceOf(EthereumAdapter)
  })

  it('returns BscAdapter for BSC', () => {
    expect(getBlockchainAdapter('BSC')).toBeInstanceOf(BscAdapter)
  })

  it('throws for an unknown network', () => {
    expect(() => getBlockchainAdapter('SOLANA' as any)).toThrow()
  })

  it('returns a fresh adapter instance on each call (no singleton)', () => {
    const a = getBlockchainAdapter('TRON')
    const b = getBlockchainAdapter('TRON')
    expect(a).not.toBe(b)
  })
})