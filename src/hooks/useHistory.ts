import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatDayShort } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import type { TransactionType } from '@/lib/db'

export type HistoryFilter = 'all' | 'income' | 'expense' | 'stock'

/** Rows fetched per page — older rows load on demand via "โหลดเพิ่ม". */
export const HISTORY_PAGE_SIZE = 50

export interface HistoryRow {
  id: string
  type: TransactionType
  amount: number
  date: string
  note: string | null
  created_at: string
  is_stock_purchase: boolean
  is_stock_cogs: boolean
  is_debt_settlement: boolean
  stock_item_id: string | null
  category: { name: string; icon: string; color_index: number } | null
}

/**
 * Transactions for the current user, filtered server-side by the active chip
 * and search text (RLS scopes to auth.uid()). Paged with useInfiniteQuery so
 * long histories load in chunks instead of being silently capped.
 */
export function useHistory(filter: HistoryFilter, search: string) {
  const { user } = useAuth()
  const q = search.trim()
  return useInfiniteQuery({
    queryKey: ['transactions', 'history', user?.id, filter, q],
    enabled: !!user,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<HistoryRow[]> => {
      let query = supabase
        .from('transactions')
        .select(
          'id, type, amount, date, note, created_at, is_stock_purchase, is_stock_cogs, is_debt_settlement, stock_item_id, category:categories(name, icon, color_index)',
        )

      if (filter === 'income') query = query.eq('type', 'income')
      else if (filter === 'expense')
        query = query.eq('type', 'expense').eq('is_stock_purchase', false)
      else if (filter === 'stock')
        query = query.or('is_stock_purchase.eq.true,stock_item_id.not.is.null')

      if (q) query = query.ilike('note', `%${q}%`)

      const from = pageParam * HISTORY_PAGE_SIZE
      query = query
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + HISTORY_PAGE_SIZE - 1)

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
    // A full-size page means there may be more; a short page is the end.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === HISTORY_PAGE_SIZE ? allPages.length : undefined,
  })
}

export interface HistoryTotals {
  count: number
  income: number
  expense: number
}

/**
 * True totals for the active filter + search — NOT derived from `rows` in
 * HistoryPage, which only holds whatever pages useHistory() has paged in so
 * far. Runs its own narrow `type, amount` select against the same filter
 * predicates as useHistory()'s queryFn above.
 *
 * NOTE: the filter branches below are intentionally a copy of the ones in
 * useHistory()'s queryFn, not a shared helper — supabase-js's query builder
 * generics make a generic wrapper awkward under strict mode. If you change
 * one, change the other, or the summary card and the filtered list below it
 * will silently disagree (the same class of bug just fixed on the Stock
 * page's age threshold — see PR-N).
 */
export function useHistoryTotals(filter: HistoryFilter, search: string) {
  const { user } = useAuth()
  const q = search.trim()
  return useQuery({
    queryKey: ['transactions', 'history-totals', user?.id, filter, q],
    enabled: !!user,
    queryFn: async (): Promise<HistoryTotals> => {
      let query = supabase.from('transactions').select('type, amount')

      if (filter === 'income') query = query.eq('type', 'income')
      else if (filter === 'expense')
        query = query.eq('type', 'expense').eq('is_stock_purchase', false)
      else if (filter === 'stock')
        query = query.or('is_stock_purchase.eq.true,stock_item_id.not.is.null')

      if (q) query = query.ilike('note', `%${q}%`)

      const { data, error } = await query
      if (error) throw error
      const rows = data ?? []
      let income = 0
      let expense = 0
      for (const r of rows) {
        if (r.type === 'income') income += Number(r.amount) || 0
        else expense += Number(r.amount) || 0
      }
      return { count: rows.length, income, expense }
    },
  })
}

export interface DayGroup {
  key: string
  label: string
  sub: string | null
  income: number
  expense: number
  rows: HistoryRow[]
}

function dayLabel(dateStr: string): { label: string; sub: string | null } {
  // Both sides are the local-midnight of a pure date string, so the day diff is
  // timezone-stable; "today" is the Bangkok calendar day (todayISO), not the
  // device's, so วันนี้/เมื่อวาน stay correct on a phone set to another zone.
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date(todayISO() + 'T00:00:00')
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000)
  if (diff === 0) return { label: 'วันนี้', sub: formatDayShort(d) }
  if (diff === 1) return { label: 'เมื่อวาน', sub: formatDayShort(d) }
  return { label: formatDayShort(d), sub: null }
}

/** Groups rows (already date-desc) into day buckets with per-day in/out totals. */
export function groupByDay(rows: HistoryRow[]): DayGroup[] {
  const groups: DayGroup[] = []
  let current: DayGroup | null = null
  for (const r of rows) {
    if (!current || current.key !== r.date) {
      const { label, sub } = dayLabel(r.date)
      current = { key: r.date, label, sub, income: 0, expense: 0, rows: [] }
      groups.push(current)
    }
    current.rows.push(r)
    if (r.type === 'income') current.income += Number(r.amount) || 0
    else current.expense += Number(r.amount) || 0
  }
  return groups
}
