import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

/**
 * Live SKU preview from the DB — the single source of truth is the
 * stock_sku_preview RPC (which shares stock_sku_build with the intake RPC), so
 * the preview can never drift from what intake actually generates.
 *
 * The value is APPROXIMATE: another tab/device may consume the sequence before
 * this item is saved, so the trailing number can shift. The format
 * (prefix / brand code / digits / separator) is authoritative.
 */
export function useSkuPreview(brand: string) {
  const { user } = useAuth()
  const b = brand.trim()
  return useQuery({
    queryKey: ['sku_preview', user?.id, b],
    enabled: !!user,
    staleTime: 60_000,
    // keep showing the previous SKU while a new brand keystroke re-fetches
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('stock_sku_preview', {
        p_brand: b || undefined,
      })
      if (error) throw error
      return data ?? ''
    },
  })
}
