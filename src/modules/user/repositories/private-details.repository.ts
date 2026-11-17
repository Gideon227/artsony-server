import { supabase } from '@/config/database'

// Phone number + billing address. Deliberately NOT part of UserProfileFields:
// those are public-safe by contract, these are private to the account owner.
export type PrivateDetails = {
  phone_number: string | null
  billing_address: string | null
  billing_city: string | null
  billing_state: string | null
  billing_postal_code: string | null
  billing_country_code: string | null
}

export const PRIVATE_DETAIL_KEYS = [
  'phone_number',
  'billing_address',
  'billing_city',
  'billing_state',
  'billing_postal_code',
  'billing_country_code',
] as const satisfies readonly (keyof PrivateDetails)[]

const COLUMNS = PRIVATE_DETAIL_KEYS.join(', ')

function toPrivateDetails(row: any): PrivateDetails {
  return {
    phone_number:         row?.['phone_number'] ?? null,
    billing_address:      row?.['billing_address'] ?? null,
    billing_city:         row?.['billing_city'] ?? null,
    billing_state:        row?.['billing_state'] ?? null,
    billing_postal_code:  row?.['billing_postal_code'] ?? null,
    billing_country_code: row?.['billing_country_code']?.trim() || null,
  }
}

export const privateDetailsRepository = {
  // A missing row means the user has never saved anything — all nulls.
  async get(userId: string): Promise<PrivateDetails> {
    const result = await (supabase() as any)
      .from('user_private_details')
      .select(COLUMNS)
      .eq('user_id', userId)
      .maybeSingle()

    if (result.error) {
      throw new Error(`[Supabase:privateDetails.get] ${result.error.message}`)
    }
    return toPrivateDetails(result.data)
  },

  // Upsert: the row is created lazily on first save. Only the keys present in
  // `changes` are written, so saving the phone never touches the billing
  // address and vice versa.
  async upsert(userId: string, changes: Partial<PrivateDetails>): Promise<PrivateDetails> {
    const result = await (supabase() as any)
      .from('user_private_details')
      .upsert(
        { ['user_id']: userId, ...changes, ['updated_at']: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      .select(COLUMNS)
      .single()

    if (result.error) {
      throw new Error(`[Supabase:privateDetails.upsert] ${result.error.message}`)
    }
    return toPrivateDetails(result.data)
  },
}
