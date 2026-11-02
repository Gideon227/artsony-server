import { isIP } from 'node:net'
import type { Request } from 'express'

/**
 * Turns whatever an HTTP layer hands us into a plain IPv4/IPv6 string, or null.
 * Handles "1.2.3.4:5678", "[::1]:443" and IPv4-mapped IPv6 ("::ffff:1.2.3.4").
 */
export function normalizeIp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let ip = raw.trim()
  if (!ip) return null

  if (ip.startsWith('[')) {
    const end = ip.indexOf(']')
    if (end === -1) return null
    ip = ip.slice(1, end)
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.slice(0, ip.lastIndexOf(':'))
  }

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (mapped) ip = mapped[1]!

  return isIP(ip) ? ip : null
}

function isPublicIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number) as [number, number]
  if (a === 0 || a === 10 || a === 127) return false              // "this" network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false              // 100.64.0.0/10 carrier-grade NAT
  if (a === 169 && b === 254) return false                        // link-local
  if (a === 172 && b >= 16 && b <= 31) return false               // private
  if (a === 192 && b === 168) return false                        // private
  if (a === 192 && b === 0 && ip.startsWith('192.0.0.')) return false
  if (a === 192 && b === 0 && ip.startsWith('192.0.2.')) return false     // documentation
  if (a === 198 && (b === 18 || b === 19)) return false           // benchmarking
  if (a === 198 && b === 51 && ip.startsWith('198.51.100.')) return false // documentation
  if (a === 203 && b === 0 && ip.startsWith('203.0.113.')) return false   // documentation
  if (a >= 224) return false                                      // multicast + reserved
  return true
}

function isPublicIpv6(ip: string): boolean {
  // Let the URL parser canonicalise it (0:0:0:0:0:0:0:1 -> ::1, upper -> lower case).
  let host: string
  try {
    host = new URL(`http://[${ip}]/`).hostname.replace(/^\[|\]$/g, '')
  } catch {
    return false
  }
  if (host === '::' || host === '::1') return false
  if (/^f[cd]/.test(host)) return false                          // fc00::/7 unique local
  if (/^fe[89ab]/.test(host)) return false                       // fe80::/10 link-local
  if (host.startsWith('ff')) return false                        // multicast
  if (host.startsWith('2001:db8')) return false                  // documentation
  return true
}

/** True only for addresses a geolocation service could actually place. */
export function isPublicIp(ip: string | null | undefined): ip is string {
  const normalized = normalizeIp(ip)
  if (!normalized) return false
  return isIP(normalized) === 4 ? isPublicIpv4(normalized) : isPublicIpv6(normalized)
}

/**
 * The address of the person making the request.
 *
 * Uses Express's `req.ip`, which honours the `trust proxy` setting, instead of
 * reading X-Forwarded-For directly: the *first* entry of that header is
 * whatever the client chose to send, so anyone could claim any location.
 *
 * Behind Cloudflare, set `trustCloudflare` so CF-Connecting-IP (which
 * Cloudflare overwrites on every request) is preferred. Only enable that when
 * the server is reachable exclusively through Cloudflare.
 */
export function getClientIp(req: Request, opts: { trustCloudflare: boolean }): string | null {
  if (opts.trustCloudflare) {
    const fromCf = normalizeIp(req.headers['cf-connecting-ip'])
    if (fromCf) return fromCf
  }
  return normalizeIp(req.ip) ?? normalizeIp(req.socket?.remoteAddress)
}