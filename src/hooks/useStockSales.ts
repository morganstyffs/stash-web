import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { monthBounds } from '@/lib/dates'

/** One recorded sale of an item (for the item's sale history + reverse action). */
export interface ItemSale {
  id: string
  qty_sold: number
  sale_price: number
  cost_at_sale: number
  profit: number
  sold_on: string
}

/** Sales of a single stock item, newest first. */
export function useItemSales(itemId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['stock_sales', 'item', user?.id, itemId],
    enabled: !!user && !!itemId,
    queryFn: async (): Promise<ItemSale[]> => {
      const { data, error } = await supabase
        .from('stock_sales')
        .select('id, qty_sold, sale_price, cost_at_sale, profit, sold_on')
        .eq('stock_item_id', itemId!)
        .order('sold_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ItemSale[]
    },
  })
}

export interface SalesSummary {
  revenue: number
  cogs: number
  profit: number
  sale_count: number
  qty_sold: number
}

/**
 * Realised sales totals for the current month via the stock_sales_summary RPC
 * (aggregation is done in SQL — PostgREST can't sum sale_price*qty_sold). Shown
 * on the stock screen (not the home screen).
 */
export function useStockSalesSummary() {
  const { user } = useAuth()
  const b = monthBounds()
  return useQuery({
    queryKey: ['stock_sales', 'summary', user?.id, b.key],
    enabled: !!user,
    queryFn: async (): Promise<SalesSummary> => {
      const { data, error } = await supabase.rpc('stock_sales_summary', {
        p_from: b.start,
        p_to: b.next,
      })
      if (error) throw error
      const row = (data as SalesSummary[])?.[0]
      return (
        row ?? { revenue: 0, cogs: 0, profit: 0, sale_count: 0, qty_sold: 0 }
      )
    },
  })
}
