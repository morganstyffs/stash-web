import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { dayOfMonthISO, monthBounds, monthBoundsFromKey, monthKey, todayISO } from '@/lib/dates'
import type { CategoryKind } from '@/lib/db'

export interface BudgetRow {
  id: string
  category_id: string
  amount: number
  /** The role flags ride along so the page can drop a budget row whose category
   *  is no longer budgetable (isBudgetableCategory) — hidden from the list AND
   *  the total — without a second query. */
  category: {
    name: string
    icon: string
    color_index: number
    kind: CategoryKind
    is_system: boolean
    is_shop_category: boolean
    is_stock_category: boolean
  } | null
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
        .select(
          'id, category_id, amount, category:categories(name, icon, color_index, kind, is_system, is_shop_category, is_stock_category)',
        )
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

export type PaceState = 'over' | 'fast' | 'unused' | 'on_track'

export interface Pace {
  state: PaceState
  /** used / budget, 0..∞ */
  ratio: number
  pct: number
  /** budget − used, as-is: negative when over budget, NEVER clamped to 0. The
   *  note builder shows `over` for the over case; this stays the true figure. */
  remaining: number
  /** used − budget when over, else 0 — the overshoot the note shows directly. */
  over: number
}

/** The date-independent part of the verdict: over / unused / on_track. 'fast'
 *  (spending outrunning the elapsed days) is the ONLY pace call that needs the
 *  date, so it is layered on top in computePace and left off for a closed month
 *  (computePaceStatic). No component re-derives this — both entry points share it. */
function baseState(used: number, budget: number): Exclude<PaceState, 'fast'> {
  if (used > budget && budget > 0) return 'over'
  if (used === 0 && budget > 0) return 'unused'
  return 'on_track'
}

function paceAmounts(used: number, budget: number): Pick<Pace, 'ratio' | 'pct' | 'remaining' | 'over'> {
  const ratio = budget > 0 ? used / budget : 0
  return {
    ratio,
    pct: Math.round(ratio * 100),
    remaining: budget - used,
    over: used > budget ? used - budget : 0,
  }
}

/**
 * Classifies spending pace for a category against the elapsed month fraction —
 * the single source that decides a row's state (the note wording lives in
 * lib/budgetNote's paceNote, driven by this state). `now` is injectable purely
 * so tests can pin the date (the elapsed-fraction branch is otherwise
 * time-dependent); it defaults to the current time, so runtime is unchanged.
 */
export function computePace(used: number, budget: number, now = new Date()): Pace {
  const amounts = paceAmounts(used, budget)
  const base = baseState(used, budget)
  const b = monthBounds(now)
  // Bangkok day-of-month (not the device-local getDate()) so elapsed matches the
  // Bangkok month window computed above.
  const elapsed = dayOfMonthISO(todayISO(now)) / b.days // fraction of month gone
  // 'fast' only upgrades an otherwise on_track row — over/unused keep their state.
  const state: PaceState =
    base === 'on_track' && budget > 0 && amounts.ratio > elapsed * 1.1 ? 'fast' : base
  return { state, ...amounts }
}

/**
 * Pace for a CLOSED month — same states minus 'fast'. A month that's over has no
 * days left to be ahead or behind of, so the elapsed comparison is meaningless
 * (calling computePace with today's date would measure the WRONG month). Shares
 * baseState with computePace so "over / unused / on_track" is decided in one
 * place, never re-inlined in the page.
 */
export function computePaceStatic(used: number, budget: number): Pace {
  return { state: baseState(used, budget), ...paceAmounts(used, budget) }
}
