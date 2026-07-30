import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Category, Favorite, TransactionType } from '@/lib/db'

/**
 * Categories for the signed-in user, ordered as in the design.
 * RLS scopes rows to auth.uid(); we still key the cache by user id so a re-login
 * as a different account can't read a stale cache.
 */
export function useCategories() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['categories', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('kind', { ascending: true })
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

/** One-tap favorite presets. Empty until the user creates some (none are seeded). */
export function useFavorites() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['favorites', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Favorite[]> => {
      const { data, error } = await supabase
        .from('favorites')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

export interface FavoriteInput {
  id?: string
  label: string
  type: TransactionType
  amount: number | null
  category_id: string | null
  wallet_id: string | null
  note: string | null
}

/** Create or update a favorite preset (user_id set explicitly; RLS enforces it). */
export function useUpsertFavorite() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: FavoriteInput) => {
      if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
      const fields = {
        label: input.label,
        type: input.type,
        amount: input.amount,
        category_id: input.category_id,
        wallet_id: input.wallet_id,
        note: input.note,
      }
      if (input.id) {
        const { error } = await supabase.from('favorites').update(fields).eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('favorites')
          .insert({ user_id: user.id, ...fields })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  })
}

export function useDeleteFavorite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('favorites').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  })
}
