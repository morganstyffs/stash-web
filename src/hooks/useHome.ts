import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { monthBounds } from '@/lib/dates'
import type { Category, TransactionType } from '@/lib/database.types'

/** Minimal transaction shape used by the home aggregates. */
interface MonthRow {
  amount: number
  type: TransactionType
  date: string
  category_id: string | null
  is_stock_purchase: boolean
}

/** A recent transaction joined with its category (for the ledger rows). */
export interface RecentRow {
  id: string
  type: TransactionType
  amount: number
  date: string
  note: string | null
  created_at: string
  category: { name: string; icon: string | null; color: string | null } | null
}

/**
 * Raw transactions from the start of *last* month up to now — enough to derive
 * this month's in/out, safe-to-spend, the daily trend, the category donut, and
 * the month-over-month delta, all from a single query.
 */
export function useMonthTransactions() {
  const { user } = useAuth()
  const b = monthBounds()
  return useQuery({
    queryKey: ['transactions', 'summary', user?.id, b.key],
    enabled: !!user,
    queryFn: async (): Promise<MonthRow[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('amount, type, date, category_id, is_stock_purchase')
        .gte('date', b.prevStart)
        .lt('date', b.next)
      if (error) throw error
      return (data ?? []) as MonthRow[]
    },
  })
}

/** The latest handful of transactions for the "รายการล่าสุด" list. */
export function useRecentTransactions(limit = 8) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['transactions', 'recent', user?.id, limit],
    enabled: !!user,
    queryFn: async (): Promise<RecentRow[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select(
          'id, type, amount, date, note, created_at, category:categories(name, icon, color)',
        )
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as unknown as RecentRow[]
    },
  })
}

export interface DonutSlice {
  categoryId: string
  name: string
  color: string
  total: number
}

export interface HomeSummary {
  income: number
  expense: number
  /** safe-to-spend = income − expense (stock purchases excluded as inventory) */
  safeToSpend: number
  /** % change of safe-to-spend vs last month, or null when last month is empty */
  deltaPct: number | null
  /** number of income transactions this month */
  incomeCount: number
  /** number of (non-stock) expense transactions this month */
  expenseCount: number
  /** cumulative expense per day of the month (index 0 = day 1) for the trend line */
  dailyCumExpense: number[]
  /** expense grouped by category, largest first */
  donut: DonutSlice[]
}

const FALLBACK_SLICE_COLORS = ['#2CC0A0', '#F5C64C', '#FB7A57', '#34C471', '#171717']

/**
 * Pure aggregation of the month rows into everything the home screen renders.
 * Stock purchases are treated as inventory and excluded from spending figures
 * (design spec §3, accounting model).
 */
export function computeHomeSummary(
  rows: MonthRow[],
  categories: Category[],
): HomeSummary {
  const b = monthBounds()
  const catById = new Map(categories.map((c) => [c.id, c]))

  let income = 0
  let expense = 0
  let incomeCount = 0
  let expenseCount = 0
  let prevSafe = 0
  let prevIncome = 0
  let prevExpense = 0
  const dailyCum = new Array<number>(b.days).fill(0)
  const byCat = new Map<string, number>()

  for (const r of rows) {
    const inThisMonth = r.date >= b.start && r.date < b.next
    const amount = Number(r.amount) || 0
    if (inThisMonth) {
      if (r.type === 'income') {
        income += amount
        incomeCount += 1
      } else if (!r.is_stock_purchase) {
        expense += amount
        expenseCount += 1
        const dayIdx = new Date(r.date).getDate() - 1
        if (dayIdx >= 0 && dayIdx < dailyCum.length) dailyCum[dayIdx] += amount
        const key = r.category_id ?? 'none'
        byCat.set(key, (byCat.get(key) ?? 0) + amount)
      }
    } else {
      // previous month
      if (r.type === 'income') prevIncome += amount
      else if (!r.is_stock_purchase) prevExpense += amount
    }
  }
  prevSafe = prevIncome - prevExpense

  // running cumulative for the trend line
  for (let i = 1; i < dailyCum.length; i++) dailyCum[i] += dailyCum[i - 1]

  const safeToSpend = income - expense
  const deltaPct =
    prevSafe > 0 ? Math.round(((safeToSpend - prevSafe) / prevSafe) * 100) : null

  const donut: DonutSlice[] = [...byCat.entries()]
    .map(([id, total], i) => {
      const cat = catById.get(id)
      return {
        categoryId: id,
        name: cat?.name ?? 'อื่นๆ',
        color: cat?.color || FALLBACK_SLICE_COLORS[i % FALLBACK_SLICE_COLORS.length],
        total,
      }
    })
    .sort((a, b2) => b2.total - a.total)

  return {
    income,
    expense,
    safeToSpend,
    deltaPct,
    incomeCount,
    expenseCount,
    dailyCumExpense: dailyCum,
    donut,
  }
}
