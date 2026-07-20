import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { formatDayShort } from '@/lib/format'
import type { TransactionType } from '@/lib/database.types'

export type HistoryFilter = 'all' | 'income' | 'expense' | 'stock'

export interface HistoryRow {
  id: string
  type: TransactionType
  amount: number
  date: string
  note: string | null
  created_at: string
  is_stock_purchase: boolean
  stock_item_id: string | null
  category: { name: string; icon: string | null; color: string | null } | null
}

/**
 * Transactions for the current user, filtered server-side by the active chip
 * and search text (RLS scopes to auth.uid()).
 */
export function useHistory(filter: HistoryFilter, search: string) {
  const { user } = useAuth()
  const q = search.trim()
  return useQuery({
    queryKey: ['transactions', 'history', user?.id, filter, q],
    enabled: !!user,
    queryFn: async (): Promise<HistoryRow[]> => {
      let query = supabase
        .from('transactions')
        .select(
          'id, type, amount, date, note, created_at, is_stock_purchase, stock_item_id, category:categories(name, icon, color)',
        )

      if (filter === 'income') query = query.eq('type', 'income')
      else if (filter === 'expense')
        query = query.eq('type', 'expense').eq('is_stock_purchase', false)
      else if (filter === 'stock')
        query = query.or('is_stock_purchase.eq.true,stock_item_id.not.is.null')

      if (q) query = query.ilike('note', `%${q}%`)

      query = query
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as HistoryRow[]
    },
  })
}

export interface DayGroup {
  key: string
  label: string
  sub: string | null
  income: number
  expense: number
  rows: HistoryRow[]
}

function dayLabel(dateStr: string): { label: string; sub: string | null } {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000)
  if (diff === 0) return { label: 'วันนี้', sub: formatDayShort(d) }
  if (diff === 1) return { label: 'เมื่อวาน', sub: formatDayShort(d) }
  return { label: formatDayShort(d), sub: null }
}

/** Groups rows (already date-desc) into day buckets with per-day in/out totals. */
export function groupByDay(rows: HistoryRow[]): DayGroup[] {
  const groups: DayGroup[] = []
  let current: DayGroup | null = null
  for (const r of rows) {
    if (!current || current.key !== r.date) {
      const { label, sub } = dayLabel(r.date)
      current = { key: r.date, label, sub, income: 0, expense: 0, rows: [] }
      groups.push(current)
    }
    current.rows.push(r)
    if (r.type === 'income') current.income += Number(r.amount) || 0
    else current.expense += Number(r.amount) || 0
  }
  return groups
}
