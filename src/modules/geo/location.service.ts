import { config } from '@/config'
import { userRepository } from '@/modules/auth/repositories/user.repository'
import { resolveLocation } from './geo.service'
import { planLocationWrite } from './location-policy'
import type { GeoLocation } from './geo.types'

type LocationContext = {
  ipAddress: string | null
  geo?: GeoLocation | null
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: NodeJS.Timeout
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Detects where the user is connecting from and saves it.
 *
 * Never throws and never blocks auth for long: sign-up awaits it (bounded by
 * the lookup timeout) so the first response already carries the country;
 * login fires it in the background.
 *
 * What gets written is decided by planLocationWrite — in short, the private
 * detected_* columns always update, and the public profile location only
 * updates while the user hasn't set one themselves.
 */
export async function recordLocation(
  user: { id: string; username: string },
  ctx: LocationContext,
): Promise<void> {
  if (!config.geo.enabled) return

  try {
    const detected = await withTimeout(
      resolveLocation({ ip: ctx.ipAddress, cdn: ctx.geo ?? null }),
      config.geo.lookupTimeoutMs + 500,
    )

    if (config.geo.debug) {
      console.log('[Geo] lookup', { ip: ctx.ipAddress, detected })
    }
    if (!detected) return

    const stored = await userRepository.getLocationState(user.id)
    const plan = planLocationWrite(stored, detected, { autofillRegion: config.geo.autofillRegion })
    await userRepository.saveLocation(user.id, user.username, plan)
  } catch (err) {
    console.error('[Geo] Could not record location:', err)
  }
}