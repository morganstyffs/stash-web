import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { CategoryKind, Wallet } from '@/lib/db'

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
  /** ป้ายร้าน (ถังที่ 2) — mutually exclusive with is_stock_category, DB CHECK
   *  also forbids it on system categories (0026). */
  is_shop_category: boolean
  icon: string
  /** chosen colour slot 1–6, or null to let the DB pick an unused one (create). */
  colorIndex: number | null
}

export function useUpsertCategory() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: CategoryInput) => {
      if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
      if (input.id) {
        // edit always carries the current colour, so color_index is set; guard
        // anyway so we never write null/0 into a NOT NULL 1–6 column on update.
        const patch: {
          name: string
          kind: CategoryKind
          is_stock_category: boolean
          is_shop_category: boolean
          icon: string
          color_index?: number
        } = {
          name: input.name,
          kind: input.kind,
          is_stock_category: input.is_stock_category,
          is_shop_category: input.is_shop_category,
          icon: input.icon,
        }
        if (input.colorIndex != null) patch.color_index = input.colorIndex
        const { error } = await supabase.from('categories').update(patch).eq('id', input.id)
        if (error) throw error
      } else {
        // Omit color_index when the user didn't pick one → the DB's BEFORE INSERT
        // trigger assigns an unused slot (never computed on the client).
        const row: {
          user_id: string
          name: string
          kind: CategoryKind
          is_stock_category: boolean
          is_shop_category: boolean
          icon: string
          sort_order: number
          color_index?: number
        } = {
          user_id: user.id,
          name: input.name,
          kind: input.kind,
          is_stock_category: input.is_stock_category,
          is_shop_category: input.is_shop_category,
          icon: input.icon,
          sort_order: 100,
        }
        if (input.colorIndex != null) row.color_index = input.colorIndex
        const { error } = await supabase.from('categories').insert(row)
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
      if (error) {
        // FK RESTRICT: a category with transactions can't be deleted.
        if (error.code === '23503')
          throw new Error('ลบไม่ได้ — หมวดนี้มีรายการอยู่ ย้ายรายการก่อนแล้วค่อยลบ')
        // restrict_violation from the system-category guard trigger (0012).
        if (error.code === '23001')
          throw new Error('ลบไม่ได้ — หมวดระบบ (ขายสต็อก / ต้นทุนขายสต็อก) ลบไม่ได้')
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

/** Toggle a single category's is_shop_category flag (ป้ายร้าน — ถังที่ 2). The
 *  DB CHECK forbids it on system/stock categories; the UI disables the toggle
 *  there so this should never hit 23514, but the error still reaches the user if
 *  it does. Flipping it fires a DB trigger that re-flags every past transaction
 *  in this category (0026), which is why the toast wording warns about old
 *  months moving. */
export function useToggleShopCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from('categories')
        .update({ is_shop_category: input.value })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      // Both the categories list AND every money surface can shift (past-month
      // budgets/summaries), so invalidate transactions too.
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
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
