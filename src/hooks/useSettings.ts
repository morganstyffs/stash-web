import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { CategoryKind, Wallet } from '@/lib/database.types'

/** Wallets for the current user. */
export function useWallets() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['wallets', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Wallet[]> => {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Wallet[]
    },
  })
}

/** Count of active recurring rules (shown as a summary in settings). */
export function useRecurringCount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['recurring', 'count', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('recurring')
        .select('id', { count: 'exact', head: true })
      if (error) throw error
      return count ?? 0
    },
  })
}

export interface CategoryInput {
  id?: string
  name: string
  kind: CategoryKind
  is_stock_category: boolean
}

export function useUpsertCategory() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: CategoryInput) => {
      if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
      if (input.id) {
        const { error } = await supabase
          .from('categories')
          .update({
            name: input.name,
            kind: input.kind,
            is_stock_category: input.is_stock_category,
          })
          .eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('categories').insert({
          user_id: user.id,
          name: input.name,
          kind: input.kind,
          is_stock_category: input.is_stock_category,
          icon: 'tag',
          sort_order: 100,
        })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      // FK RESTRICT: a category with transactions can't be deleted — surface it.
      if (error) {
        if (error.code === '23503')
          throw new Error('ลบไม่ได้ — หมวดนี้มีรายการอยู่ ย้ายรายการก่อนแล้วค่อยลบ')
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

/** Toggle a single category's is_stock_category flag. */
export function useToggleStockCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from('categories')
        .update({ is_stock_category: input.value })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export interface WalletInput {
  id?: string
  name: string
  type: Wallet['type']
}

export function useUpsertWallet() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: WalletInput) => {
      if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
      if (input.id) {
        const { error } = await supabase
          .from('wallets')
          .update({ name: input.name, type: input.type })
          .eq('id', input.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('wallets')
          .insert({ user_id: user.id, name: input.name, type: input.type })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallets'] }),
  })
}

export function useDeleteWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wallets').delete().eq('id', id)
      if (error) {
        if (error.code === '23503')
          throw new Error('ลบไม่ได้ — กระเป๋านี้มีรายการอยู่')
        throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallets'] }),
  })
}
