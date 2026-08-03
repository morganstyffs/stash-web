import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { monthBoundsFromKey, monthKey } from '@/lib/dates'
import type { TransactionType } from '@/lib/db'

/** The recent list is capped here (also the cache-warm slice in useAddTransaction). */
export const RECENT_LIMIT = 8

/** Minimal transaction shape used by the home aggregates. */
export interface MonthRow {
  amount: number
  type: TransactionType
  date: string
  category_id: string | null
  is_stock_purchase: boolean
  is_stock_cogs: boolean
  is_debt_settlement: boolean
  /** shop operating cost/income (ถังที่ 2) — DB-derived (0026). Feeds
   *  isBudgetSpendingRow so shop costs don't eat the personal budget. */
  is_shop_operating: boolean
}

/** A recent transaction joined with its category (for the ledger rows). */
export interface RecentRow {
  id: string
  type: TransactionType
  amount: number
  date: string
  note: string | null
  created_at: string
  category: { name: string; icon: string; color_index: number } | null
}

/**
 * Raw transactions from the start of *last* month up to now — enough to derive
 * this month's in/out, safe-to-spend, the daily trend, the category donut, and
 * the month-over-month delta, all from a single query.
 */
export function useMonthTransactions(month: string = monthKey()) {
  const { user } = useAuth()
  const b = monthBoundsFromKey(month)
  return useQuery({
    queryKey: ['transactions', 'summary', user?.id, b.key],
    enabled: !!user,
    queryFn: async (): Promise<MonthRow[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('amount, type, date, category_id, is_stock_purchase, is_stock_cogs, is_debt_settlement, is_shop_operating')
        .gte('date', b.prevStart)
        .lt('date', b.next)
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * The latest handful of transactions for the "รายการล่าสุด" list.
 *
 * limit is a constant (not a queryKey part) so useAddTransaction can warm this
 * cache without first reading the limit back out of the key. Sole caller is
 * HomePage; a caller that ever needs a different size must revisit that write.
 */
export function useRecentTransactions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['transactions', 'recent', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<RecentRow[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select(
          'id, type, amount, date, note, created_at, category:categories(name, icon, color_index)',
        )
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT)
      if (error) throw error
      return data ?? []
    },
  })
}

// computeHomeSummary + its HomeSummary/DonutSlice shapes moved to
// `src/lib/homeSummary.ts` so the AI worker (no React) can import them (PR-2a).
