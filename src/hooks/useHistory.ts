import { useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatDayShort } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import type { TransactionType } from '@/lib/db'
import type { Database } from '@/lib/database.types'

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

export interface HistoryTotals {
  count: number
  income: number
  expense: number
}

/** One page of search results: the rows for that page + the totals for the WHOLE
 *  match set (not just this page). */
export interface HistorySearchPage {
  rows: HistoryRow[]
  totals: HistoryTotals
}

export const EMPTY_TOTALS: HistoryTotals = { count: 0, income: 0, expense: 0 }

/** A raw row from the transactions_search RPC — derived from the generated types,
 *  never hand-typed (convention 12). Its columns are flat (category_name / _icon /
 *  _color_index) and the three match_* totals repeat identically on every row.
 *
 *  transactions_search LEFT JOINs categories, so an uncategorised row really comes
 *  back with category_name = null — but the generator declares it non-null. Correct
 *  exactly that one left-join column (still derived from the generated row, not a
 *  hand-written shape); _icon / _color_index stay non-null because they are only
 *  read inside the `category_name != null` branch of toSearchPage. */
type RawSearchRow = Database['public']['Functions']['transactions_search']['Returns'][number]
type SearchRow = Omit<RawSearchRow, 'category_name'> & { category_name: string | null }

/**
 * Shape the raw transactions_search result into what the screen renders.
 *
 * The totals are a window aggregate carried IDENTICALLY on every row (count(*)
 * over () etc.), so reading the first row is enough. No rows means nothing
 * matched, which is exactly a zero total set.
 *
 * The generator can declare category_name (and _icon / _color_index) non-null
 * even though the LEFT JOIN really returns null for a row with no category, so
 * the nest is rebuilt from an explicit `category_name != null` check — which
 * compiles whether the generator calls it nullable or not, no cast (convention
 * 11). When it is non-null the row genuinely has a category, so icon + color are
 * present too.
 */
export function toSearchPage(raw: SearchRow[]): HistorySearchPage {
  const rows: HistoryRow[] = raw.map((r) => ({
    id: r.id,
    type: r.type,
    amount: Number(r.amount),
    date: r.date,
    note: r.note,
    created_at: r.created_at,
    is_stock_purchase: r.is_stock_purchase,
    is_stock_cogs: r.is_stock_cogs,
    is_debt_settlement: r.is_debt_settlement,
    stock_item_id: r.stock_item_id,
    category:
      r.category_name != null
        ? {
            name: r.category_name,
            icon: r.category_icon,
            color_index: r.category_color_index,
          }
        : null,
  }))

  const first = raw[0]
  const totals: HistoryTotals = first
    ? {
        count: Number(first.match_count),
        income: Number(first.match_income),
        expense: Number(first.match_expense),
      }
    : EMPTY_TOTALS

  return { rows, totals }
}

/**
 * Transactions for the current user, filtered server-side by the active chip and
 * searched across note + category name + amount, in a single RPC that also
 * returns the totals for the whole match set (RLS scopes to auth.uid()). Paged
 * with useInfiniteQuery so long histories load in chunks instead of being
 * silently capped.
 */
export function useHistory(filter: HistoryFilter, search: string) {
  const { user } = useAuth()
  const q = search.trim()
  return useInfiniteQuery({
    queryKey: ['transactions', 'history', user?.id, filter, q],
    enabled: !!user,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<HistorySearchPage> => {
      const { data, error } = await supabase.rpc('transactions_search', {
        p_filter: filter,
        // blank = no search: the RPC nullifs an empty/whitespace p_q itself
        // (nullif(btrim(coalesce(p_q,'')),'')), so the empty string is the null
        // case. Passed as a string because the generated arg type is non-null;
        // do NOT "fix" this to `q || null` — that reintroduces a type error.
        p_q: q,
        p_limit: HISTORY_PAGE_SIZE,
        p_offset: pageParam * HISTORY_PAGE_SIZE,
      })
      if (error) throw error
      return toSearchPage(data ?? [])
    },
    // A full-size page means there may be more; a short page is the end.
    getNextPageParam: (lastPage, allPages) =>
      lastPage.rows.length === HISTORY_PAGE_SIZE ? allPages.length : undefined,
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
