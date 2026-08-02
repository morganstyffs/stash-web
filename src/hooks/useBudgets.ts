import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { dayOfMonthISO, monthBounds, monthBoundsFromKey, monthKey, todayISO } from '@/lib/dates'

export interface BudgetRow {
  id: string
  category_id: string
  amount: number
  category: { name: string; icon: string; color_index: number } | null
}

/** Budgets for the current month, joined with their category. */
export function useBudgets(month: string = monthKey()) {
  const { user } = useAuth()
  const b = monthBoundsFromKey(month)
  return useQuery({
    queryKey: ['budgets', user?.id, b.key],
    enabled: !!user,
    queryFn: async (): Promise<BudgetRow[]> => {
      const { data, error } = await supabase
        .from('budgets')
        .select('id, category_id, amount, category:categories(name, icon, color_index)')
        .eq('month', b.start)
      if (error) throw error
      return data ?? []
    },
  })
}

/** Sum of this month's budgets — used by the home "งบที่ตั้งไว้" strip. */
export function useMonthBudgetTotal(month: string = monthKey()) {
  const { user } = useAuth()
  const b = monthBoundsFromKey(month)
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
export function useMonthSpending(month: string = monthKey()) {
  const { user } = useAuth()
  const b = monthBoundsFromKey(month)
  return useQuery({
    queryKey: ['transactions', 'byCategory', user?.id, b.key],
    enabled: !!user,
    queryFn: async (): Promise<Record<string, number>> => {
      // Budget spending = isBudgetSpendingRow (lib/ledger.ts), mirrored here in
      // SQL: expense, not a stock purchase, NOT recognised COGS, NOT a debt
      // settlement, and NOT a shop operating cost (ถังที่ 2 — running the shop is
      // real money out but not personal budgeted spending). Keep these .eq()
      // clauses in lockstep with isBudgetSpendingRow — one rule, two surfaces.
      const { data, error } = await supabase
        .from('transactions')
        .select('amount, category_id')
        .eq('type', 'expense')
        .eq('is_stock_purchase', false)
        .eq('is_stock_cogs', false)
        .eq('is_debt_settlement', false)
        .eq('is_shop_operating', false)
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

export interface BudgetSummary {
  /** sum of every category budget set this month */
  totalBudget: number
  /** spending that lands in a budgeted category (the hero's used figure) */
  usedInBudgeted: number
  /** spending in categories with no budget set (money spent off-budget) */
  offBudget: number
  /** how many off-budget keys actually have spending > 0 */
  offBudgetCount: number
  /** totalBudget − usedInBudgeted, shown as-is (negative when over budget) */
  remaining: number
}

/**
 * Reduce this month's budgets + per-category spending into the budget-page hero
 * figures. The fix (B5, sibling of B1): "remaining" must compare like with like
 * — budgeted spend against the budget total — not the *whole* month's spend
 * against a partial budget total, which painted the hero permanently red the
 * moment you set one budget and spent in an un-budgeted category. Off-budget
 * spend is surfaced separately instead of silently dragging the headline down.
 * `remaining` is never clamped: an over-budget month shows the real negative.
 */
export function computeBudgetSummary(
  budgets: { category_id: string; amount: number | string }[],
  spending: Record<string, number>,
): BudgetSummary {
  const budgetedIds = new Set(budgets.map((b) => b.category_id))
  const totalBudget = budgets.reduce((s, b) => s + (Number(b.amount) || 0), 0)

  let usedInBudgeted = 0
  let offBudget = 0
  let offBudgetCount = 0
  for (const [categoryId, amount] of Object.entries(spending)) {
    const value = Number(amount) || 0
    if (budgetedIds.has(categoryId)) {
      usedInBudgeted += value
    } else {
      offBudget += value
      if (value > 0) offBudgetCount += 1
    }
  }

  return {
    totalBudget,
    usedInBudgeted,
    offBudget,
    offBudgetCount,
    remaining: totalBudget - usedInBudgeted,
  }
}

export type PaceState = 'over' | 'fast' | 'on_track'

export interface Pace {
  state: PaceState
  /** used / budget, 0..∞ */
  ratio: number
  pct: number
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
      note: `เกินงบ ${Math.round(used - budget).toLocaleString('th-TH')} ฿`,
    }
  }
  if (budget > 0 && ratio > elapsed * 1.1) {
    return { state: 'fast', ratio, pct, note: 'ใช้เร็วกว่ากำหนด' }
  }
  return { state: 'on_track', ratio, pct, note: 'พอดีจังหวะ' }
}
