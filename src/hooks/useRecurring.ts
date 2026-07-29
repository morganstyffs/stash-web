import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/Toast'
import { translateError } from '@/lib/errors'
import type { Recurring, TransactionType } from '@/lib/database.types'

/** All recurring rules for the current user (active + paused). */
export function useRecurringList() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['recurring', 'list', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Recurring[]> => {
      const { data, error } = await supabase
        .from('recurring')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Recurring[]
    },
  })
}

export interface RecurringInput {
  id?: string
  label: string
  type: TransactionType
  amount: number
  category_id: string | null
  wallet_id: string | null
  schedule: string
  /** YYYY-MM-DD — the next date this rule should fire. */
  next_run: string
  active?: boolean
}

export function useUpsertRecurring() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: RecurringInput) => {
      if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
      const row = {
        label: input.label,
        type: input.type,
        amount: input.amount,
        category_id: input.category_id,
        wallet_id: input.wallet_id,
        schedule: input.schedule,
        next_run: input.next_run,
        active: input.active ?? true,
      }
      if (input.id) {
        const { error } = await supabase.from('recurring').update(row).eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('recurring')
          .insert({ user_id: user.id, ...row })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring'] }),
  })
}

/** Pause / resume a rule without deleting it. */
export function useToggleRecurringActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('recurring')
        .update({ active: input.active })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring'] }),
  })
}

export function useDeleteRecurring() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring'] }),
  })
}

/**
 * Fire the recurring_run_due() RPC once per app load: it materializes every due
 * occurrence (backfilling missed periods with their correct dates) and advances
 * next_run server-side. On success we refresh transactions + recurring so the
 * new rows appear immediately.
 *
 * Error handling (F-14): every failure surfaces as a toast — no silent swallow.
 * The old code hid errors "in case migration 0007 isn't applied yet", but 0007/
 * 0008 are long applied and the function exists, so that guard was dead and only
 * risked re-hiding real failures. If a fresh environment ever lacks the RPC, the
 * resulting toast is the correct signal, not something to suppress.
 */
export function useRunRecurringOnLoad() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const toast = useToast()
  const ran = useRef(false)
  useEffect(() => {
    if (!user || ran.current) return
    ran.current = true
    void supabase.rpc('recurring_run_due').then(({ data, error }) => {
      if (error) {
        toast.error(`รายการประจำไม่ทำงาน: ${translateError(error)}`)
        return
      }
      if ((data ?? 0) > 0) {
        qc.invalidateQueries({ queryKey: ['transactions'] })
        qc.invalidateQueries({ queryKey: ['recurring'] })
      }
    })
  }, [user, qc, toast])
}
