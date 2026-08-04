import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { monthBounds, monthBoundsFromKey, monthKey } from '@/lib/dates'
import { isBudgetableCategory } from '@/lib/budgetable'
import type { CategoryKind } from '@/lib/db'

/** The one budgets↔category join both surfaces read — keep the two queries on the
 *  same shape so the row flags are always there to filter on (budgetableRows). */
const BUDGET_WITH_CATEGORY_SELECT =
  'id, category_id, amount, category:categories(name, icon, color_index, kind, is_system, is_shop_category, is_stock_category)'

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
        .select(BUDGET_WITH_CATEGORY_SELECT)
        .eq('month', b.start)
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * The budget rows whose category still qualifies to carry a budget
 * (isBudgetableCategory · lib/budgetable) — the ONE filter both the home
 * "งบที่ตั้งไว้" total and the budget page funnel through, so a category that
 * became a shop/stock/system row (or was flipped after a budget was set) drops
 * out of the list AND every total in lockstep. Same rule, one place (convention
 * 3) — never re-inline the predicate on a second surface.
 */
export function budgetableRows(rows: BudgetRow[]): BudgetRow[] {
  return rows.filter((r) => r.category != null && isBudgetableCategory(r.category))
}

/**
 * Sum of this month's *budgetable* budgets — the home "งบที่ตั้งไว้" strip. Joins
 * the category and runs it through budgetableRows so the strip's number equals the
 * budget page's totalBudget for the same data: without the filter a budget left on
 * a category later turned into a shop/stock/system row would inflate the home total
 * while never showing on the budget page (the exact bug this fixes).
 */
export function useMonthBudgetTotal(month: string = monthKey()) {
  const { user } = useAuth()
  const b = monthBoundsFromKey(month)
  return useQuery({
    queryKey: ['budgets', 'total', user?.id, b.key],
    enabled: !!user,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('budgets')
        .select(BUDGET_WITH_CATEGORY_SELECT)
        .eq('month', b.start)
      if (error) throw error
      return budgetableRows(data ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
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

// Pace logic moved to lib/budgetPace.ts (§11/12: lib/ เดินทางเดียว — the AI
// worker imports pace from lib/, and lib/budgetNote can no longer reach back
// into hooks/). Re-exported here so existing call sites keep working; new
// callers should import from @/lib/budgetPace directly.
export { computePace, computePaceStatic } from '@/lib/budgetPace'
export type { Pace, PaceState } from '@/lib/budgetPace'
