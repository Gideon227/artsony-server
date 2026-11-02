// A location derived from an IP address (or CDN headers describing one).
// `country` is always an upper-case ISO 3166-1 alpha-2 code — the same format
// profiles.country already uses, so it can be written straight into it.
// `state` / `city` are free text (like the rest of the schema) and are only
// present when the source can provide them (CDN headers, a city-level database).
export type GeoLocation = {
  country: string
  state: string | null
  city: string | null
  provider: 'cloudflare' | 'ipinfo-lite'
}

// Who last set profiles.country / state / city:
//   'ip'   — auto-filled from the user's connection; login may refresh it
//   'user' — the user typed/cleared it themselves; never overwritten
export type LocationSource = 'ip' | 'user'