import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/**
 * Live SKU preview from the DB — the single source of truth is the
 * stock_sku_preview RPC (which shares stock_sku_build with the intake RPC), so
 * the preview can never drift from what intake actually generates.
 *
 * The value is APPROXIMATE: another tab/device may consume the sequence before
 * this item is saved, so the trailing number can shift (the RPC is STABLE and
 * does NOT reserve a number). The real SKU is minted only on save. Since the SKU
 * no longer encodes the brand (0025 — prefix + sequence only), the preview takes
 * no arguments.
 */
export function useSkuPreview() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['sku_preview', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('stock_sku_preview')
      if (error) throw error
      return data ?? ''
    },
  })
}
