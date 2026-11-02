import { createHash } from 'node:crypto'
import { config } from '@/config'
import { RedisKeys, RedisTTL, redisGetJson, redisSetJson } from '@/modules/redis/redis.client'
import { isPublicIp, normalizeIp } from '@/common/utils/ip.utils'
import { lookupIpinfoLite } from './providers/ipinfo-lite.provider'
import type { GeoLocation } from './geo.types'

let warnedNoProvider = false

// Cache keys use a hash so raw IP addresses never sit in Redis key names.
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32)
}

/**
 * Best-effort "where is this connection?". Returns null whenever it can't tell
 * (private/dev address, lookup failed, no provider configured) — callers must
 * treat a missing location as normal, never as an error.
 *
 * Order: CDN headers (free, instant, may include city) → cached lookup →
 * IPinfo Lite (country only, free). A city-level database can be added as one
 * more step here later without touching any caller.
 */
export async function resolveLocation(input: {
  ip: string | null
  cdn: GeoLocation | null
}): Promise<GeoLocation | null> {
  if (!config.geo.enabled) return null
  if (input.cdn) return input.cdn

  // GEO_DEV_IP lets you test from localhost, where the real address is private.
  const ip = normalizeIp(config.geo.devIp) ?? input.ip
  if (!isPublicIp(ip)) return null

  if (!config.geo.ipinfoToken) {
    if (!warnedNoProvider) {
      warnedNoProvider = true
      console.warn('[Geo] No provider configured — set IPINFO_TOKEN (or enable CDN headers) to detect locations.')
    }
    return null
  }

  const key = RedisKeys.geoIp(hashIp(ip))

  try {
    const cached = await redisGetJson<GeoLocation>(key)
    if (cached) return cached
  } catch {
    // Redis hiccup — fall through to a live lookup.
  }

  const found = await lookupIpinfoLite(ip, config.geo.ipinfoToken, config.geo.lookupTimeoutMs)

  if (found) {
    try {
      await redisSetJson(key, found, RedisTTL.geoIp)
    } catch {
      // Caching is an optimisation only.
    }
  }

  return found
}