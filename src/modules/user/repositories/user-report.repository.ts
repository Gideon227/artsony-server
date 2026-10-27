import { supabase } from '@/config/database'

export const userReportRepository = {
  async create(input: { reporterId: string; reportedUserId: string; reason: string; notes: string | null; conversationId: string | null }): Promise<void> {
    const result = await (supabase() as any).from('user_reports').upsert(
      {
        ['reporter_id']: input.reporterId,
        ['reported_user_id']: input.reportedUserId,
        ['reason']: input.reason,
        ['notes']: input.notes,
        ['conversation_id']: input.conversationId,
      },
      { onConflict: 'reporter_id,reported_user_id', ignoreDuplicates: true },
    )
    if (result.error) throw new Error(`[Supabase:userReport.create] ${result.error.message}`)
  },
}