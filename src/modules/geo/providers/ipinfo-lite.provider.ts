import type { GeoLocation } from '../geo.types'

/**
 * IPinfo Lite: free, unlimited, country-level (plus ASN). It does NOT return
 * region or city — those need a paid IPinfo plan, a city-level database, or
 * Cloudflare's location headers.
 * Docs: https://ipinfo.io/documentation (Lite endpoint: api.ipinfo.io/lite/{ip})
 */
export async function lookupIpinfoLite(
  ip: string,
  token: string,
  timeoutMs: number,
): Promise<GeoLocation | null> {
  try {
    const res = await fetch(`https://api.ipinfo.io/lite/${encodeURIComponent(ip)}`, {
      headers: {
        Accept: 'application/json',
        // Basic auth keeps the token out of URLs (and therefore out of proxy/access logs).
        Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!res.ok) {
      console.warn(`[Geo] IPinfo Lite responded ${res.status}`)
      return null
    }

    const data = (await res.json()) as { country_code?: unknown }
    const country = typeof data.country_code === 'string' ? data.country_code.toUpperCase() : ''
    if (!/^[A-Z]{2}$/.test(country)) return null

    return { country, state: null, city: null, provider: 'ipinfo-lite' }
  } catch (err) {
    // Timeouts and network errors are expected now and then — location is best-effort.
    const name = (err as { name?: string }).name
    if (name !== 'TimeoutError' && name !== 'AbortError') {
      console.warn('[Geo] IPinfo Lite lookup failed:', (err as Error).message)
    }
    return null
  }
}