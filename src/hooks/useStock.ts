import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { signStockPhotos } from '@/lib/storage'
import type { StockItem } from '@/lib/database.types'

export interface StockData {
  items: StockItem[]
  /** object-path → signed URL for each item's first photo */
  thumbs: Record<string, string>
}

/** All stock items for the user, newest first, with signed first-photo URLs. */
export function useStockItems() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['stock_items', 'list', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<StockData> => {
      const { data, error } = await supabase
        .from('stock_items')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      const items = (data ?? []) as StockItem[]
      const firstPhotos = items
        .map((i) => i.photos?.[0])
        .filter((p): p is string => !!p)
      const thumbs = await signStockPhotos(firstPhotos)
      return { items, thumbs }
    },
  })
}

/** Count of stock items — used to seed the SKU sequence on the intake screen. */
export function useStockCount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['stock_count', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('stock_items')
        .select('id', { count: 'exact', head: true })
      if (error) throw error
      return count ?? 0
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
