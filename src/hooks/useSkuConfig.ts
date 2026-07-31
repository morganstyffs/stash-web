import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { StockSkuConfig } from '@/lib/db'

/**
 * The caller's own SKU config row (one per user). Returns null when the row
 * hasn't been created yet — the settings screen then shows the default prefix
 * ('STZ') and upserts on first save, so a fresh user never sees an empty screen
 * or an error (mirrors the self-heal in stock_intake_create).
 *
 * Writes go straight to the table (it has an own-row UPDATE/INSERT policy, 0011)
 * — same pattern as display_name in useUpdateDisplayName, no RPC needed.
 */
export function useSkuConfig() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['sku_config', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<StockSkuConfig | null> => {
      const { data, error } = await supabase
        .from('stock_sku_config')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return (data as StockSkuConfig) ?? null
    },
  })
}

/**
 * Set the SKU prefix. Upsert (not update) so it works whether or not the config
 * row already exists. The prefix format is enforced by the DB CHECK
 * (`stock_sku_config_prefix_check`, 0025) as well as the client — a violation
 * arrives as SQLSTATE 23514 and is translated in errors.ts (caught by CODE, not
 * message — rule 14). Never resets next_seq (the counter is separate from the
 * format — §5).
 *
 * onSuccess invalidates BOTH the config row and the preview, since the preview
 * (stock_sku_preview) reads the prefix.
 */
export function useUpdateSkuPrefix() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (prefix: string) => {
      if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
      const { error } = await supabase
        .from('stock_sku_config')
        .upsert({ user_id: user.id, prefix }, { onConflict: 'user_id' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sku_config'] })
      qc.invalidateQueries({ queryKey: ['sku_preview'] })
    },
  })
}
