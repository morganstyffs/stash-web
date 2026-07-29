import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { signStockPhotos } from '@/lib/storage'
import type { StockItem } from '@/lib/database.types'

export interface StockData {
  items: StockItem[]
  /** object-path → signed URL for each item's first photo */
  thumbs: Record<string, string>
  /** item id → number of recorded sales (drives "has sales" / locked fields) */
  salesCount: Record<string, number>
}

/** All stock items for the user, newest first, with signed first-photo URLs and
 * a per-item sales count embedded in the same query (no N+1). */
export function useStockItems() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['stock_items', 'list', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<StockData> => {
      // `sales:stock_sales(count)` embeds the related-row count via the FK, so a
      // single request returns each item's sale count instead of one query/row.
      const { data, error } = await supabase
        .from('stock_items')
        .select('*, sales:stock_sales(count)')
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as (StockItem & { sales?: { count: number }[] })[]
      const salesCount: Record<string, number> = {}
      const items = rows.map(({ sales, ...item }) => {
        salesCount[item.id] = sales?.[0]?.count ?? 0
        return item as StockItem
      })
      const firstPhotos = items
        .map((i) => i.photos?.[0])
        .filter((p): p is string => !!p)
      const thumbs = await signStockPhotos(firstPhotos)
      return { items, thumbs, salesCount }
    },
  })
}

/**
 * Deletes a stock item and its paired stock-purchase expense atomically via the
 * stock_item_delete RPC (0006). Blocked server-side when the item has sales
 * history — we translate that into a plain-language message. Invalidates both
 * stock and transaction queries since a ledger row may have been removed too.
 */
export function useDeleteStockItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('stock_item_delete', { p_item_id: id })
      if (error) {
        // restrict_violation (23001) from our guard, or the FK RESTRICT (23503)
        // as a fallback — both mean the item has recorded sales.
        if (error.code === '23001' || error.code === '23503') {
          throw new Error('ลบไม่ได้ — สินค้านี้มีประวัติการขายแล้ว ต้องย้อนรายการขายก่อน')
        }
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock_items'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export interface StockHero {
  costValue: number
  pendingProfit: number
}

/** Hero aggregates over items still in stock (in_stock / partial). */
export function computeStockHero(items: StockItem[]): StockHero {
  let costValue = 0
  let pendingProfit = 0
  for (const it of items) {
    if (it.status === 'sold') continue
    const remaining = it.qty_remaining ?? 0
    costValue += (Number(it.cost_per_unit) || 0) * remaining
    if (it.target_price != null) {
      pendingProfit += (Number(it.target_price) - Number(it.cost_per_unit)) * remaining
    }
  }
  return { costValue, pendingProfit }
}
