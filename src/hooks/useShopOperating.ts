import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/**
 * The PostgREST page ceiling this query is capped at. We ask for exactly this many
 * rows; if we get them all back, we can't tell whether the range held exactly this
 * many or more, so the totals may be short — surfaced as `capped` (see below).
 * Shop-operating rows are a tiny subset (shipping/packaging/fees/marketing only),
 * so this is a safety net, not an expected path. If it ever trips for real, move
 * this aggregation into a SQL RPC (like stock_sales_summary) instead of raising it.
 */
export const SHOP_ROW_CAP = 1000

export interface ShopOperating {
  /** Σ amount of income rows (e.g. ค่าส่งที่เก็บจากลูกค้า). */
  income: number
  /** Σ amount of expense rows (ค่าส่ง / บรรจุภัณฑ์ / ค่าธรรมเนียม / การตลาด). */
  expense: number
  /** true when the row cap was hit → the totals above may be incomplete. */
  capped: boolean
}

/** Minimal row shape the sum needs — a plain object so tests don't touch the DB. */
export interface ShopRow {
  type: 'income' | 'expense'
  amount: number
}

/**
 * Split shop-operating rows into income vs expense totals. Pure + exported so the
 * split rule is unit-tested without a live query (convention 11).
 */
export function sumShopRows(rows: ShopRow[]): { income: number; expense: number } {
  let income = 0
  let expense = 0
  for (const r of rows) {
    const amount = Number(r.amount) || 0
    if (r.type === 'income') income += amount
    else expense += amount
  }
  return { income, expense }
}

/**
 * Shop-operating totals (ถังที่ 2) for a [from, to) date window, split by income /
 * expense. Summed on the client — deliberately NOT an RPC: this ships without a
 * migration (merge in one shot, no types-drift wait), and the matched set is a
 * small subset (only is_shop_operating rows). Unlike the old useHistoryTotals bug,
 * there's no pagination here — the whole window is summed at once — but PostgREST
 * still caps a page, so we ask for SHOP_ROW_CAP rows and flag `capped` if we hit it
 * rather than silently under-reporting (rule: an error must reach the user).
 */
export function useShopOperatingSummary(fromISO: string, toISO: string) {
  const { user } = useAuth()
  return useQuery({
    // range in the key so "this month" and "3 months" are separate caches.
    queryKey: ['transactions', 'shopOperating', user?.id, fromISO, toISO],
    enabled: !!user,
    queryFn: async (): Promise<ShopOperating> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('type, amount')
        .eq('is_shop_operating', true)
        .gte('date', fromISO)
        .lt('date', toISO)
        .limit(SHOP_ROW_CAP)
      if (error) throw error
      const rows = data ?? []
      return { ...sumShopRows(rows), capped: rows.length >= SHOP_ROW_CAP }
    },
  })
}
