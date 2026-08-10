import { supabase } from '@/config/database'
import type { NotificationPreferences, NotificationType } from '@/common/types'

const DEFAULTS: Omit<NotificationPreferences, 'id' | 'user_id' | 'updated_at'> = {
  push_enabled:  true,
  email_enabled: true,
  ws_enabled:    true,
  types_muted:   [],
}

function toPreferences(row: any, userId: string): NotificationPreferences {
  return {
    id:            row?.['id'] ?? '',
    user_id:       userId,
    push_enabled:  row?.['push_enabled']  ?? DEFAULTS.push_enabled,
    email_enabled: row?.['email_enabled'] ?? DEFAULTS.email_enabled,
    ws_enabled:    row?.['ws_enabled']    ?? DEFAULTS.ws_enabled,
    types_muted:   row?.['types_muted']   ?? DEFAULTS.types_muted,
    updated_at:    row?.['updated_at'] ? new Date(row['updated_at']) : new Date(),
  }
}

export const notificationPreferencesRepository = {
  // Table comment: "Created lazily on first preference change" — a missing
  // row means the user has never touched their preferences, which is
  // exactly the DEFAULTS above (all channels on, nothing muted).
  async get(userId: string): Promise<NotificationPreferences> {
    const result = await (supabase() as any)
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (result.error) {
      throw new Error(`[Supabase:notificationPreferences.get] ${result.error.message}`)
    }
    return toPreferences(result.data, userId)
  },

  async update(
    userId: string,
    changes: Partial<Pick<NotificationPreferences, 'push_enabled' | 'email_enabled' | 'ws_enabled' | 'types_muted'>>,
  ): Promise<NotificationPreferences> {
    const result = await (supabase() as any)
      .from('notification_preferences')
      .upsert(
        { ['user_id']: userId, ...changes, ['updated_at']: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      .select('*')
      .single()

    if (result.error) {
      throw new Error(`[Supabase:notificationPreferences.update] ${result.error.message}`)
    }
    return toPreferences(result.data, userId)
  },

  // Purpose-built, minimal read for the enforcement check in
  // notification.service.ts — avoids the full row shape when only the
  // mute list and channel flags are needed.
  async getEnforcementFlags(
    userId: string,
  ): Promise<{ types_muted: NotificationType[]; ws_enabled: boolean }> {
    const result = await (supabase() as any)
      .from('notification_preferences')
      .select('types_muted, ws_enabled')
      .eq('user_id', userId)
      .maybeSingle()

    if (result.error) {
      // Enforcement must fail open (deliver the notification) rather than
      // block real-time delivery because of a transient preferences-read
      // error — this is a convenience filter, not a security boundary.
      console.error('[NotificationPreferences] getEnforcementFlags failed, defaulting to unmuted:', result.error.message)
      return { types_muted: [], ws_enabled: true }
    }

    return {
      types_muted: result.data?.['types_muted'] ?? [],
      ws_enabled:  result.data?.['ws_enabled']  ?? true,
    }
  },
}
