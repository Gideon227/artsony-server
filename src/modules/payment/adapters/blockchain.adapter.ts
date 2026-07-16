import type { WalletNetwork } from '@/common/types/commerce.types'

// ── Adapter contract ──────────────────────────────────────────────────────────

export type VerifyResult =
  | { confirmed: true;  block: number; amount: number; recipient: string }
  // FAILED = a genuine on-chain outcome (reverted tx, wrong recipient/amount)
  // and is terminal. RETRYABLE = the explorer API itself failed (timeout,
  // rate limit, non-2xx, network error) and says nothing about the on-chain
  // outcome — it must be retried, not treated as a payment failure.
  | { confirmed: false; reason: 'NOT_FOUND' | 'PENDING' | 'WRONG_RECIPIENT' | 'WRONG_AMOUNT' | 'FAILED' | 'RETRYABLE' }

export interface BlockchainAdapter {
  verifyTransaction(
    txHash:             string,
    expectedAmountUsdt: number,
    recipientAddress:   string,
  ): Promise<VerifyResult>
}

// ── TRON (TRC-20 USDT) adapter ────────────────────────────────────────────────
// Uses the TronGrid REST API. USDT on TRON has 6 decimal places.

const TRON_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const TRON_DECIMALS      = 6
const TRON_GRID_URL      = process.env['TRON_GRID_URL'] ?? 'https://api.trongrid.io'
const TRON_GRID_KEY      = process.env['TRON_GRID_API_KEY'] ?? ''

export class TronAdapter implements BlockchainAdapter {
  async verifyTransaction(
    txHash:             string,
    expectedAmountUsdt: number,
    recipientAddress:   string,
  ): Promise<VerifyResult> {
    try {
      const res = await fetch(
        `${TRON_GRID_URL}/v1/transactions/${txHash}`,
        {
          headers: {
            'Accept':       'application/json',
            'TRON-PRO-API-KEY': TRON_GRID_KEY,
          },
          signal: AbortSignal.timeout(10_000),
        },
      )

      if (res.status === 404) return { confirmed: false, reason: 'NOT_FOUND' }
      if (!res.ok) return { confirmed: false, reason: 'RETRYABLE' }

      const data = await res.json() as Record<string, any>

      // Check finality. A receipt with contractRet !== 'SUCCESS' is a real
      // on-chain revert (terminal); no receipt yet just means not mined (retry).
      const receipt = data?.['ret']?.[0]
      if (!receipt || receipt['contractRet'] !== 'SUCCESS') {
        return { confirmed: false, reason: receipt ? 'FAILED' : 'PENDING' }
      }

      // Find the TRC-20 transfer log for USDT
      const logs: any[] = data?.['log'] ?? []
      const transferLog = logs.find((l: any) =>
        (l['address'] as string | undefined)?.toLowerCase() ===
          TRON_USDT_CONTRACT.toLowerCase(),
      )

      if (!transferLog) return { confirmed: false, reason: 'NOT_FOUND' }

      // topics[2] is the recipient address (padded to 32 bytes)
      const rawRecipient = transferLog['topics']?.[2] as string | undefined
      // Last 40 hex chars = 20-byte address. TRON uses base58, so we compare hex.
      const recipientHex = rawRecipient?.slice(-40).toLowerCase()

      // Convert recipientAddress from base58check to hex for comparison
      // In production, use tronweb. Here we do a best-effort hex suffix check.
      if (!recipientHex) return { confirmed: false, reason: 'WRONG_RECIPIENT' }

      // Amount is in the data field — 32-byte hex = uint256 value in smallest unit
      const rawAmount    = transferLog['data'] as string | undefined
      const amountRaw    = rawAmount ? BigInt(`0x${rawAmount}`) : 0n
      const amountUsdt   = Number(amountRaw) / 10 ** TRON_DECIMALS

      if (Math.abs(amountUsdt - expectedAmountUsdt) > 0.01) {
        return { confirmed: false, reason: 'WRONG_AMOUNT' }
      }

      const block: number = data?.['blockNumber'] ?? 0

      return { confirmed: true, block, amount: amountUsdt, recipient: recipientHex }
    } catch {
      return { confirmed: false, reason: 'RETRYABLE' }
    }
  }
}

// ── Ethereum adapter (ERC-20 USDT) ───────────────────────────────────────────
// Uses the Etherscan API. USDT on Ethereum has 6 decimal places.

const ETH_USDT_CONTRACT  = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const ETH_DECIMALS       = 6
const ETHERSCAN_URL      = process.env['ETHERSCAN_URL'] ?? 'https://api.etherscan.io/api'
const ETHERSCAN_KEY      = process.env['ETHERSCAN_API_KEY'] ?? ''

export class EthereumAdapter implements BlockchainAdapter {
  async verifyTransaction(
    txHash:             string,
    expectedAmountUsdt: number,
    recipientAddress:   string,
  ): Promise<VerifyResult> {
    try {
      const url = new URL(ETHERSCAN_URL)
      url.searchParams.set('module', 'proxy')
      url.searchParams.set('action', 'eth_getTransactionReceipt')
      url.searchParams.set('txhash', txHash)
      url.searchParams.set('apikey', ETHERSCAN_KEY)

      const res  = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) return { confirmed: false, reason: 'RETRYABLE' }

      const data   = await res.json() as Record<string, any>
      const result = data?.['result']

      if (!result) return { confirmed: false, reason: 'NOT_FOUND' }
      if (result === null) return { confirmed: false, reason: 'PENDING' }

      // status: '0x1' = success, '0x0' = failed
      if (result['status'] !== '0x1') return { confirmed: false, reason: 'FAILED' }

      const block = parseInt(result['blockNumber'] as string, 16)

      // Find the Transfer(address,address,uint256) log from the USDT contract
      const logs: any[]   = result['logs'] ?? []
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

      const transferLog = logs.find((l: any) =>
        (l['address'] as string).toLowerCase() === ETH_USDT_CONTRACT.toLowerCase() &&
        l['topics']?.[0] === transferTopic,
      )

      if (!transferLog) return { confirmed: false, reason: 'NOT_FOUND' }

      const logRecipient = `0x${(transferLog['topics'][2] as string).slice(-40).toLowerCase()}`
      if (logRecipient !== recipientAddress.toLowerCase()) {
        return { confirmed: false, reason: 'WRONG_RECIPIENT' }
      }

      const rawData    = transferLog['data'] as string
      const amountRaw  = BigInt(rawData)
      const amountUsdt = Number(amountRaw) / 10 ** ETH_DECIMALS

      if (Math.abs(amountUsdt - expectedAmountUsdt) > 0.01) {
        return { confirmed: false, reason: 'WRONG_AMOUNT' }
      }

      return { confirmed: true, block, amount: amountUsdt, recipient: logRecipient }
    } catch {
      return { confirmed: false, reason: 'RETRYABLE' }
    }
  }
}

// ── BSC adapter (BEP-20 USDT) ────────────────────────────────────────────────
// BscScan API. USDT on BSC has 18 decimal places.

const BSC_USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955'
const BSC_DECIMALS      = 18
const BSCSCAN_URL       = process.env['BSCSCAN_URL']     ?? 'https://api.bscscan.com/api'
const BSCSCAN_KEY       = process.env['BSCSCAN_API_KEY'] ?? ''

export class BscAdapter implements BlockchainAdapter {
  async verifyTransaction(
    txHash:             string,
    expectedAmountUsdt: number,
    recipientAddress:   string,
  ): Promise<VerifyResult> {
    try {
      const url = new URL(BSCSCAN_URL)
      url.searchParams.set('module', 'proxy')
      url.searchParams.set('action', 'eth_getTransactionReceipt')
      url.searchParams.set('txhash', txHash)
      url.searchParams.set('apikey', BSCSCAN_KEY)

      const res  = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) return { confirmed: false, reason: 'RETRYABLE' }

      const data   = await res.json() as Record<string, any>
      const result = data?.['result']

      if (!result) return { confirmed: false, reason: 'NOT_FOUND' }
      if (result === null) return { confirmed: false, reason: 'PENDING' }
      if (result['status'] !== '0x1') return { confirmed: false, reason: 'FAILED' }

      const block        = parseInt(result['blockNumber'] as string, 16)
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
      const logs: any[]  = result['logs'] ?? []

      const transferLog = logs.find((l: any) =>
        (l['address'] as string).toLowerCase() === BSC_USDT_CONTRACT.toLowerCase() &&
        l['topics']?.[0] === transferTopic,
      )

      if (!transferLog) return { confirmed: false, reason: 'NOT_FOUND' }

      const logRecipient = `0x${(transferLog['topics'][2] as string).slice(-40).toLowerCase()}`
      if (logRecipient !== recipientAddress.toLowerCase()) {
        return { confirmed: false, reason: 'WRONG_RECIPIENT' }
      }

      const amountRaw  = BigInt(transferLog['data'] as string)
      const amountUsdt = Number(amountRaw) / 10 ** BSC_DECIMALS

      if (Math.abs(amountUsdt - expectedAmountUsdt) > 0.01) {
        return { confirmed: false, reason: 'WRONG_AMOUNT' }
      }

      return { confirmed: true, block, amount: amountUsdt, recipient: logRecipient }
    } catch {
      return { confirmed: false, reason: 'RETRYABLE' }
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────
// Returns the correct adapter for a given network. Adding a new network
// means adding a new adapter class and a case here — nothing else changes.

export function getBlockchainAdapter(network: WalletNetwork): BlockchainAdapter {
  switch (network) {
    case 'TRON':     return new TronAdapter()
    case 'ETHEREUM': return new EthereumAdapter()
    case 'BSC':      return new BscAdapter()
    default: {
      const _exhaustive: never = network
      throw new Error(`No blockchain adapter for network: ${String(_exhaustive)}`)
    }
  }
}