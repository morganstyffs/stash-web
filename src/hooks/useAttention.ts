import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isStale } from '@/pages/StockPage'

export interface AttentionSummary {
  needsDetails: number
  stale: number
  /** distinct items needing *any* attention — not needsDetails + stale summed,
   *  since one item can be both at once and shouldn't be counted twice on the
   *  bell's badge. */
  total: number
}

/**
 * Counts for the header bell. Deliberately NOT `useStockItems()` — that query
 * also signs every item's first photo and joins `stock_sales` for the sales
 * count, which the bell doesn't need at all and would otherwise re-run that
 * full cost on every visit to the Home page (likely the most-visited screen in
 * the app). This runs a narrow three-column select instead.
 *
 * Shares the `stock_items` query-key prefix on purpose: every mutation that
 * already invalidates `['stock_items']` (intake, edit, delete, sale, reverse,
 * queue update) invalidates this too, so the badge stays correct for free.
 */
export function useAttentionSignals() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['stock_items', 'attention', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AttentionSummary> => {
      const { data, error } = await supabase
        .from('stock_items')
        .select('id, status, needs_details, created_at')
      if (error) throw error
      const rows = data ?? []
      const now = new Date()
      const needsDetails = rows.filter((r) => r.needs_details).length
      const stale = rows.filter((r) => isStale(r, now)).length
      const total = rows.filter((r) => r.needs_details || isStale(r, now)).length
      return { needsDetails, stale, total }
    },
  })
}
