import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { monthBounds, todayISO } from '@/lib/dates'
import { insertMonth, insertRecent } from '@/lib/txCache'
import { RECENT_LIMIT, type MonthRow, type RecentRow } from '@/hooks/useHome'
import type { TransactionType } from '@/lib/db'

export interface NewTransaction {
  type: TransactionType
  amount: number
  categoryId: string | null
  walletId?: string | null
  note?: string | null
  /** YYYY-MM-DD; defaults to today when omitted (supports backdating). */
  date?: string
}

/**
 * The row the insert reads back — a superset of both home-screen shapes so we can
 * project it into each. created_at + the three flags are DB defaults, so they are
 * read back from the server, never guessed. The category join mirrors
 * useRecentTransactions' select verbatim so supabase-js infers the same to-one
 * relationship (retyping it by hand can drift into an array).
 */
interface InsertedRow {
  id: string
  type: TransactionType
  amount: number
  date: string
  note: string | null
  created_at: string
  category_id: string | null
  is_stock_purchase: boolean
  is_stock_cogs: boolean
  is_debt_settlement: boolean
  is_shop_operating: boolean
  category: { name: string; icon: string; color_index: number } | null
}

function toRecentRow(row: InsertedRow): RecentRow {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    date: row.date,
    note: row.note,
    created_at: row.created_at,
    category: row.category,
  }
}

function toMonthRow(row: InsertedRow): MonthRow {
  return {
    amount: row.amount,
    type: row.type,
    date: row.date,
    category_id: row.category_id,
    is_stock_purchase: row.is_stock_purchase,
    is_stock_cogs: row.is_stock_cogs,
    is_debt_settlement: row.is_debt_settlement,
    is_shop_operating: row.is_shop_operating,
  }
}

/**
 * Inserts a transaction owned by the current user and reads the real row back.
 * On success it writes that row straight into the home caches (recent list +
 * this-/last-month summary) so the new entry and the updated SAFE figure show
 * from the first frame — no flash of the previous data while the refetch is in
 * flight. This is not an optimistic update: the row is the confirmed server row,
 * so there is no fake id and no rollback path. invalidateQueries still runs
 * afterwards to bring the queries we don't hand-fill (byCategory, history, one)
 * back in sync.
 *
 * user_id is set explicitly to auth.uid()'s user; the DB column also defaults to
 * auth.uid() and RLS enforces auth.uid() = user_id on insert.
 */
export function useAddTransaction() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: NewTransaction): Promise<InsertedRow> => {
      if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          type: input.type,
          amount: input.amount,
          category_id: input.categoryId,
          wallet_id: input.walletId ?? null,
          note: input.note ?? null,
          date: input.date ?? todayISO(),
        })
        .select(
          'id, type, amount, date, note, created_at, category_id, is_stock_purchase, is_stock_cogs, is_debt_settlement, is_shop_operating, category:categories(name, icon, color_index)',
        )
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => {
      // Fill the two caches the user is staring at before invalidating, so the new
      // row is on screen from the first frame instead of after the refetch lands.
      const b = monthBounds()
      qc.setQueriesData<RecentRow[]>({ queryKey: ['transactions', 'recent'] }, (prev) =>
        prev ? insertRecent(prev, toRecentRow(row), RECENT_LIMIT) : prev,
      )
      qc.setQueriesData<MonthRow[]>({ queryKey: ['transactions', 'summary'] }, (prev) =>
        prev ? insertMonth(prev, toMonthRow(row), b.prevStart, b.next) : prev,
      )
      // Partial-match invalidation: refreshes ['transactions','summary',…] and
      // ['transactions','recent',…] plus history/byCategory in one shot.
      qc.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
