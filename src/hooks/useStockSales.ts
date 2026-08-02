import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { monthBoundsFromKey, monthKey } from '@/lib/dates'

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

const EMPTY_SUMMARY: SalesSummary = { revenue: 0, cogs: 0, profit: 0, sale_count: 0, qty_sold: 0 }

/**
 * Realised sales totals for an explicit [from, to) date window via the
 * stock_sales_summary RPC (aggregation is done in SQL — PostgREST can't sum
 * sale_price*qty_sold). fromISO is inclusive, toISO exclusive, matching the RPC.
 * The shop-profit card uses this for BOTH periods (this month + trailing 3 months)
 * so there's one code path regardless of range.
 */
export function useStockSalesRange(fromISO: string, toISO: string) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['stock_sales', 'summary', user?.id, fromISO, toISO],
    enabled: !!user,
    queryFn: async (): Promise<SalesSummary> => {
      const { data, error } = await supabase.rpc('stock_sales_summary', {
        p_from: fromISO,
        p_to: toISO,
      })
      if (error) throw error
      return (data as SalesSummary[])?.[0] ?? EMPTY_SUMMARY
    },
  })
}

/**
 * Realised sales totals for one calendar month. Thin wrapper over
 * useStockSalesRange so the RPC call lives in one place (convention 10). Feeds the
 * home WovenHero's STOCK PROFIT label. The bounds come from the Asia/Bangkok
 * calendar, the same one the RPC compares sold_on against — so p_from/p_to never
 * drift a day on a non-Bangkok device.
 */
export function useStockSalesSummary(month: string = monthKey()) {
  const b = monthBoundsFromKey(month)
  return useStockSalesRange(b.start, b.next)
}
