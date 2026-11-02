import type { IncomingHttpHeaders } from 'node:http'
import type { GeoLocation } from '../geo.types'

// Cloudflare reports "XX" when it can't place the IP and "T1" for Tor.
const UNKNOWN_COUNTRIES = new Set(['XX', 'T1'])
const MAX_FIELD_LENGTH = 100 // matches the 100-char limit on profiles.state / city

function readHeader(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name]
  const first = Array.isArray(value) ? value[0] : value
  if (!first) return null

  // Node decodes header bytes as latin-1, but Cloudflare sends UTF-8, so
  // "São Paulo" would arrive as "SÃ£o Paulo". Re-decode; if the bytes weren't
  // valid UTF-8, keep the original string.
  const utf8 = Buffer.from(first, 'latin1').toString('utf8')
  const decoded = utf8.includes('\uFFFD') ? first : utf8
  return decoded
}

function cleanText(value: string | null): string | null {
  if (!value) return null
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, MAX_FIELD_LENGTH)
  return cleaned || null
}

/**
 * Reads the location Cloudflare attaches to a request (country always, and
 * region/city when "Add visitor location headers" is enabled).
 *
 * Only call with `trust: true` when the origin server can be reached ONLY
 * through Cloudflare — otherwise a client could send these headers itself.
 */
export function parseCdnLocation(
  headers: IncomingHttpHeaders,
  opts: { trust: boolean },
): GeoLocation | null {
  if (!opts.trust) return null

  const country = readHeader(headers, 'cf-ipcountry')?.trim().toUpperCase()
  if (!country || !/^[A-Z]{2}$/.test(country) || UNKNOWN_COUNTRIES.has(country)) return null

  return {
    country,
    state: cleanText(readHeader(headers, 'cf-region')),
    city: cleanText(readHeader(headers, 'cf-ipcity')),
    provider: 'cloudflare',
  }
}