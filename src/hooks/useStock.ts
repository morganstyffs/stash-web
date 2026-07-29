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

/**
 * All stock items for the user, newest first, with signed first-photo URLs and
 * a per-item sales count. Two parallel queries (items + the sale rows' item ids)
 * — NOT N+1, and it avoids a typed embed that the hand-authored database.types
 * can't resolve (empty Relationships). Sales rows are tiny, so a plain id list
 * counted in JS is cheap and keeps the types honest (no `as unknown as`).
 */
export function useStockItems() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['stock_items', 'list', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<StockData> => {
      const [itemsRes, salesRes] = await Promise.all([
        supabase.from('stock_items').select('*').order('created_at', { ascending: false }),
        supabase.from('stock_sales').select('stock_item_id'),
      ])
      if (itemsRes.error) throw itemsRes.error
      if (salesRes.error) throw salesRes.error

      const items = (itemsRes.data ?? []) as StockItem[]
      const salesCount: Record<string, number> = {}
      for (const row of salesRes.data ?? []) {
        salesCount[row.stock_item_id] = (salesCount[row.stock_item_id] ?? 0) + 1
      }

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
