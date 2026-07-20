import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { toISODate } from '@/lib/dates'
import type { TransactionType } from '@/lib/database.types'

export interface NewTransaction {
  type: TransactionType
  amount: number
  categoryId: string | null
  walletId?: string | null
  note?: string | null
}

/**
 * Inserts a transaction owned by the current user, then invalidates every
 * transaction query so the home screen (summary + recent + charts) refetches
 * and the new row appears immediately.
 *
 * user_id is set explicitly to auth.uid()'s user; the DB column also defaults to
 * auth.uid() and RLS enforces auth.uid() = user_id on insert.
 */
export function useAddTransaction() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: NewTransaction) => {
      if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          type: input.type,
          amount: input.amount,
          category_id: input.categoryId,
          wallet_id: input.walletId ?? null,
          note: input.note ?? null,
          date: toISODate(new Date()),
        })
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      // Partial-match invalidation: refreshes ['transactions','summary',…] and
      // ['transactions','recent',…] in one shot.
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
