import type { GeoLocation, LocationSource } from './geo.types'

export type StoredLocation = {
  country: string | null
  state: string | null
  city: string | null
  location_source: LocationSource | null
}

export type LocationWritePlan = {
  // Private reading of where the user's connection is — refreshed on every
  // sign-up/login, never exposed by the API.
  detected: {
    detected_country: string
    detected_state: string | null
    detected_city: string | null
    detected_at: string
  }
  // The public profile location (profiles.country/state/city). null = leave alone.
  profile: {
    country: string
    state: string | null
    city: string | null
    location_source: 'ip'
  } | null
}

/**
 * Decides what to write after a successful lookup. The one rule that matters:
 * never overwrite a location the user chose themselves.
 *
 *  - detected_* is always updated.
 *  - country/state/city are only auto-filled while the user hasn't owned them.
 *  - A row with a location but no recorded source is treated as user-owned
 *    (defensive: it can only come from a manual edit made before this feature).
 *  - state/city are only auto-filled when `autofillRegion` is on. They are
 *    shown publicly, and IP-derived cities are the least reliable part of a
 *    lookup, so the default is country only.
 */
export function planLocationWrite(
  stored: StoredLocation | null,
  detected: GeoLocation,
  opts: { autofillRegion: boolean; now?: Date },
): LocationWritePlan {
  const hasPublicLocation = Boolean(stored?.country || stored?.state || stored?.city)
  const userOwned =
    stored?.location_source === 'user' ||
    (stored?.location_source == null && hasPublicLocation)

  return {
    detected: {
      detected_country: detected.country,
      detected_state: detected.state,
      detected_city: detected.city,
      detected_at: (opts.now ?? new Date()).toISOString(),
    },
    profile: userOwned
      ? null
      : {
          country: detected.country,
          // Always overwritten together so a moved user never ends up with
          // a country from one place and a city from another.
          state: opts.autofillRegion ? detected.state : null,
          city: opts.autofillRegion ? detected.city : null,
          location_source: 'ip',
        },
  }
}