import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { signStockPhotos } from '@/lib/storage'
import type { ItemCondition, StockItem } from '@/lib/db'

export interface QueueData {
  items: StockItem[]
  thumbs: Record<string, string>
}

/** Stock items still awaiting details (needs_details = true), oldest first. */
export function useQueueItems() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['stock_items', 'queue', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<QueueData> => {
      const { data, error } = await supabase
        .from('stock_items')
        .select('*')
        .eq('needs_details', true)
        .order('created_at', { ascending: true })
      if (error) throw error
      const items = (data ?? []) as StockItem[]
      const firstPhotos = items
        .map((i) => i.photos?.[0])
        .filter((p): p is string => !!p)
      return { items, thumbs: await signStockPhotos(firstPhotos) }
    },
  })
}

/** Which required detail fields an item is still missing (for the queue chips). */
export function missingTags(it: {
  photos?: string[] | null
  size?: string | null
  color?: string | null
  condition?: ItemCondition | null
  target_price?: number | null
}): string[] {
  const tags: string[] = []
  if (!it.photos || it.photos.length === 0) tags.push('ขาดรูป')
  if (it.target_price == null) tags.push('ขาดราคาขาย')
  if (!it.size) tags.push('ขาดไซซ์')
  if (!it.color) tags.push('ขาดสี')
  if (!it.condition) tags.push('ขาดสภาพ')
  return tags
}

export interface StockItemUpdate {
  id: string
  name: string
  category: string | null
  brand: string | null
  size: string | null
  color: string | null
  condition: ItemCondition | null
  target_price: number | null
  photos: string[]
}

export function useUpdateStockItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (u: StockItemUpdate) => {
      const stillMissing =
        missingTags({
          photos: u.photos,
          size: u.size,
          color: u.color,
          condition: u.condition,
          target_price: u.target_price,
        }).length > 0
      const { error } = await supabase
        .from('stock_items')
        .update({
          name: u.name,
          category: u.category,
          brand: u.brand,
          size: u.size,
          color: u.color,
          condition: u.condition,
          target_price: u.target_price,
          photos: u.photos,
          needs_details: stillMissing,
        })
        .eq('id', u.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock_items'] }),
  })
}
