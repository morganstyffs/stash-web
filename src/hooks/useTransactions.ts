import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isSaleLinkedRow, isStockLinkedRow } from '@/lib/ledger'
import type { TransactionType } from '@/lib/db'

/** Full editable shape of one transaction (fetched when the edit sheet opens). */
export interface EditableTx {
  id: string
  type: TransactionType
  amount: number
  category_id: string | null
  wallet_id: string | null
  date: string
  note: string | null
  is_stock_purchase: boolean
  is_stock_cogs: boolean
  is_debt_settlement: boolean
  stock_item_id: string | null
}

/** True when a transaction is tied to stock (purchase, COGS, or sale income) —
 * its money fields are managed by the stock flows, not editable here. */
export const isStockLinked = isStockLinkedRow

/** True when a transaction was created by a SALE (income leg or COGS leg) —
 * editing/deleting is blocked by a DB trigger; use stock_sale_reverse instead. */
export const isSaleLinked = isSaleLinkedRow

/** Fetches a single transaction with every field the edit sheet can change. */
export function useTransaction(id: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['transactions', 'one', user?.id, id],
    enabled: !!user && !!id,
    queryFn: async (): Promise<EditableTx> => {
      const { data, error } = await supabase
        .from('transactions')
        .select(
          'id, type, amount, category_id, wallet_id, date, note, is_stock_purchase, is_stock_cogs, is_debt_settlement, stock_item_id',
        )
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as EditableTx
    },
  })
}

export interface TxUpdate {
  id: string
  amount?: number
  category_id?: string | null
  wallet_id?: string | null
  date?: string
  note?: string | null
}

/** Updates the editable fields of a transaction, then refreshes every view. */
export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (u: TxUpdate) => {
      const { id, ...fields } = u
      const { error } = await supabase.from('transactions').update(fields).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}

/**
 * Deletes a plain transaction. Stock-purchase rows are blocked in the UI (they
 * must be removed from the stock screen, which reverses the pair) — this hook is
 * only ever called for non-stock rows.
 */
export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }),
  })
}
