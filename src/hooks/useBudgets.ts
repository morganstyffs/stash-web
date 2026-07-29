import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { dayOfMonthISO, monthBounds, todayISO } from '@/lib/dates'

export interface BudgetRow {
  id: string
  category_id: string
  amount: number
  category: { name: string; icon: string | null; color: string | null } | null
}

/** Budgets for the current month, joined with their category. */
export function useBudgets() {
  const { user } = useAuth()
  const b = monthBounds()
  return useQuery({
    queryKey: ['budgets', user?.id, b.key],
    enabled: !!user,
    queryFn: async (): Promise<BudgetRow[]> => {
      const { data, error } = await supabase
        .from('budgets')
        .select('id, category_id, amount, category:categories(name, icon, color)')
        .eq('month', b.start)
      if (error) throw error
      return (data ?? []) as unknown as BudgetRow[]
    },
  })
}

/** Sum of this month's budgets — used by the home "งบที่ตั้งไว้" strip. */
export function useMonthBudgetTotal() {
  const { user } = useAuth()
  const b = monthBounds()
  return useQuery({
    queryKey: ['budgets', 'total', user?.id, b.key],
    enabled: !!user,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('budgets')
        .select('amount')
        .eq('month', b.start)
      if (error) throw error
      return (data ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    },
  })
}

/** This month's spending per category (expense, stock purchases excluded). */
export function useMonthSpending() {
  const { user } = useAuth()
  const b = monthBounds()
  return useQuery({
    queryKey: ['transactions', 'byCategory', user?.id, b.key],
    enabled: !!user,
    queryFn: async (): Promise<Record<string, number>> => {
      // Budget spending = isBudgetSpendingRow: expense, not a stock purchase,
      // and NOT recognised COGS (a resale's cost is not budgeted spending).
      const { data, error } = await supabase
        .from('transactions')
        .select('amount, category_id')
        .eq('type', 'expense')
        .eq('is_stock_purchase', false)
        .eq('is_stock_cogs', false)
        .gte('date', b.start)
        .lt('date', b.next)
      if (error) throw error
      const map: Record<string, number> = {}
      for (const r of data ?? []) {
        const key = r.category_id ?? 'none'
        map[key] = (map[key] ?? 0) + (Number(r.amount) || 0)
      }
      return map
    },
  })
}

export function useUpsertBudget() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const b = monthBounds()
  return useMutation({
    mutationFn: async (input: { categoryId: string; amount: number }) => {
      if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
      const { error } = await supabase.from('budgets').upsert(
        {
          user_id: user.id,
          category_id: input.categoryId,
          month: b.start,
          amount: input.amount,
        },
        { onConflict: 'user_id,category_id,month' },
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('budgets').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}

export type PaceState = 'over' | 'fast' | 'on_track'

export interface Pace {
  state: PaceState
  /** used / budget, 0..∞ */
  ratio: number
  pct: number
  color: string
  note: string
}

/**
 * Classifies spending pace for a category against elapsed month fraction.
 * `now` is injectable purely so tests can pin the date (the elapsed-fraction
 * branch is otherwise time-dependent); it defaults to the current time, so
 * runtime behaviour is unchanged.
 */
export function computePace(used: number, budget: number, now = new Date()): Pace {
  const ratio = budget > 0 ? used / budget : 0
  const pct = Math.round(ratio * 100)
  const b = monthBounds(now)
  // Bangkok day-of-month (not the device-local getDate()) so elapsed matches the
  // Bangkok month window computed above.
  const elapsed = dayOfMonthISO(todayISO(now)) / b.days // fraction of month gone

  if (used > budget && budget > 0) {
    return {
      state: 'over',
      ratio,
      pct,
      color: '#E24B4A',
      note: `เกินงบ ${Math.round(used - budget).toLocaleString('th-TH')} ฿`,
    }
  }
  if (budget > 0 && ratio > elapsed * 1.1) {
    return { state: 'fast', ratio, pct, color: '#BA7517', note: 'ใช้เร็วกว่ากำหนด' }
  }
  return { state: 'on_track', ratio, pct, color: '#2CC0A0', note: 'พอดีจังหวะ' }
}
