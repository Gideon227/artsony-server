import { supabase } from '@/config/database'
import type {
  ActivationSession,
  ActivationSessionStatus,
  PackagingProofInput,
} from '@/common/types/order-activation.types'

type Row = Record<string, any>

function db(): any {
  return supabase() as any
}

function fail(label: string, error: { message: string }): never {
  throw new Error(`[orderActivation:${label}] ${error.message}`)
}

const SESSION_COLUMNS = 'id, order_item_physical_id, seller_id, status, failure_reason, expires_at, created_at, completed_at'

function toSession(row: Row): ActivationSession {
  return {
    id: String(row['id']),
    order_item_physical_id: String(row['order_item_physical_id']),
    seller_id: String(row['seller_id']),
    status: row['status'] as ActivationSessionStatus,
    failure_reason: (row['failure_reason'] as string | null) ?? null,
    expires_at: String(row['expires_at']),
    created_at: String(row['created_at']),
    completed_at: (row['completed_at'] as string | null) ?? null,
  }
}

export const orderActivationRepository = {
  async createSession(input: {
    physicalId: string
    sellerId: string
    tokenHash: string
    expiresAt: Date
  }): Promise<ActivationSession> {
    const superseded = await db()
      .from('order_activation_sessions')
      .update({ status: 'SUPERSEDED' })
      .eq('order_item_physical_id', input.physicalId)
      .eq('status', 'PENDING')
    if (superseded.error) fail('supersede', superseded.error)

    const { data, error } = await db()
      .from('order_activation_sessions')
      .insert({
        order_item_physical_id: input.physicalId,
        seller_id: input.sellerId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt.toISOString(),
      })
      .select(SESSION_COLUMNS)
      .single()
    if (error) fail('createSession', error)
    return toSession(data)
  },

  async findByTokenHash(tokenHash: string): Promise<ActivationSession | null> {
    const { data, error } = await db()
      .from('order_activation_sessions')
      .select(SESSION_COLUMNS)
      .eq('token_hash', tokenHash)
      .maybeSingle()
    if (error) fail('findByTokenHash', error)
    return data ? toSession(data) : null
  },

  async findForSeller(sessionId: string, physicalId: string, sellerId: string): Promise<ActivationSession | null> {
    const { data, error } = await db()
      .from('order_activation_sessions')
      .select(SESSION_COLUMNS)
      .eq('id', sessionId)
      .eq('order_item_physical_id', physicalId)
      .eq('seller_id', sellerId)
      .maybeSingle()
    if (error) fail('findForSeller', error)
    return data ? toSession(data) : null
  },

  // Atomically moves PENDING → PROCESSING so a link can only be consumed once.
  async claimSession(sessionId: string): Promise<boolean> {
    const { data, error } = await db()
      .from('order_activation_sessions')
      .update({ status: 'PROCESSING' })
      .eq('id', sessionId)
      .eq('status', 'PENDING')
      .gt('expires_at', new Date().toISOString())
      .select('id')
    if (error) fail('claimSession', error)
    return Array.isArray(data) && data.length === 1
  },

  async finishSession(sessionId: string, status: ActivationSessionStatus, failureReason: string | null = null): Promise<void> {
    const { error } = await db()
      .from('order_activation_sessions')
      .update({
        status,
        failure_reason: failureReason,
        completed_at: status === 'COMPLETED' ? new Date().toISOString() : null,
      })
      .eq('id', sessionId)
    if (error) fail('finishSession', error)
  },

  async markExpired(sessionId: string): Promise<void> {
    const { error } = await db()
      .from('order_activation_sessions')
      .update({ status: 'EXPIRED' })
      .eq('id', sessionId)
      .eq('status', 'PENDING')
    if (error) fail('markExpired', error)
  },

  async countPackagingProofs(physicalId: string): Promise<number> {
    const { count, error } = await db()
      .from('order_packaging_proofs')
      .select('id', { count: 'exact', head: true })
      .eq('order_item_physical_id', physicalId)
    if (error) fail('countPackagingProofs', error)
    return count ?? 0
  },

  async insertPackagingProofs(input: {
    physicalId: string
    orderId: string
    uploadedBy: string
    proofs: PackagingProofInput[]
  }): Promise<void> {
    const { error } = await db()
      .from('order_packaging_proofs')
      .insert(
        input.proofs.map((proof) => ({
          order_item_physical_id: input.physicalId,
          order_id: input.orderId,
          uploaded_by: input.uploadedBy,
          ...proof,
        })),
      )
    if (error) fail('insertPackagingProofs', error)
  },

  async trackingIdExists(trackingId: string): Promise<boolean> {
    const { count, error } = await db()
      .from('order_item_physical')
      .select('id', { count: 'exact', head: true })
      .eq('tracking_id', trackingId)
    if (error) fail('trackingIdExists', error)
    return (count ?? 0) > 0
  },
}
