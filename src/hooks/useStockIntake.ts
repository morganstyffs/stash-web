import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { StockIntakeArgs, StockIntakeResult } from '@/lib/database.types'

/**
 * Atomic stock intake: one RPC creates the expense transaction and the stock
 * item together (see 0004_stock_intake_rpc.sql). On success, both the
 * transaction views (home, history) and the stock list are invalidated.
 */
export function useCreateStockIntake() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: StockIntakeArgs): Promise<StockIntakeResult> => {
      const { data, error } = await supabase.rpc('stock_intake_create', args)
      if (error) throw error
      const row = (data as StockIntakeResult[])?.[0]
      if (!row) throw new Error('ไม่พบผลลัพธ์จากการบันทึก')
      return row
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['stock_items'] })
      // NB: not ['stock_count'] — the intake screen advances the SKU sequence
      // locally per saved item so the preview stays stable within a session.
    },
  })
}
