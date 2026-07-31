import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { isSaleLinkedRow, isStockLinkedRow } from '@/lib/ledger'
import { buildRestoreInsert, type RestorableTx } from '@/lib/txRestore'
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
  /** kept so an undo can restore the row to its original spot in the recent list */
  created_at: string
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
          'id, type, amount, category_id, wallet_id, date, note, created_at, is_stock_purchase, is_stock_cogs, is_debt_settlement, stock_item_id',
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
 * Re-inserts a just-deleted plain transaction with its original id + created_at,
 * so an "undo" returns the row to its exact spot in the recent list rather than
 * bouncing it to the top. A plain async function, not a hook: the undo button is
 * clicked after TransactionEditSheet has closed and unmounted, so a
 * component-bound mutation would be firing from a dead component. The caller
 * invalidates ['transactions'] afterwards to refresh every view.
 *
 * buildRestoreInsert throws for locked rows (stock purchase/sale, debt
 * settlement), so this can never resurrect a row that belongs to
 * stock_sales/debts as an orphaned transaction (§5).
 */
export async function restoreTransaction(snap: RestorableTx, userId: string): Promise<void> {
  const payload = buildRestoreInsert(snap, userId)
  const { error } = await supabase.from('transactions').insert(payload)
  if (error) throw error
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
