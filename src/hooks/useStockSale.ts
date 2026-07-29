import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { StockSaleArgs, StockSaleResult } from '@/lib/db'

/**
 * Records a sale atomically (income + COGS + stock deduction + stock_sales row)
 * via the stock_sale_create RPC (0012, Model A). Invalidates stock, transaction,
 * and sales queries so home, stock, and the sales stat all refresh.
 */
export function useCreateStockSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: StockSaleArgs): Promise<StockSaleResult> => {
      const { data, error } = await supabase.rpc('stock_sale_create', args)
      if (error) throw error
      const row = data?.[0]
      if (!row) throw new Error('ไม่พบผลลัพธ์จากการขาย')
      return row
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock_items'] })
      qc.invalidateQueries({ queryKey: ['stock_sales'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

/**
 * Undoes a sale atomically (deletes the sale + its two ledger rows, restores
 * stock) via stock_sale_reverse (0012). Direct edit/delete of a sale's ledger
 * rows is blocked by a DB trigger, so this is the only way to unwind a sale.
 */
export function useReverseStockSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (saleId: string) => {
      const { error } = await supabase.rpc('stock_sale_reverse', { p_sale_id: saleId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock_items'] })
      qc.invalidateQueries({ queryKey: ['stock_sales'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
