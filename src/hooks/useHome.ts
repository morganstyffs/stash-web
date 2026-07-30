import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { dayOfMonthISO, daysLeftInMonth, monthBounds } from '@/lib/dates'
import { isBudgetSpendingRow, isIncomeRow, isSpendingRow } from '@/lib/ledger'
import type { Category, TransactionType } from '@/lib/db'

/** Minimal transaction shape used by the home aggregates. */
interface MonthRow {
  amount: number
  type: TransactionType
  date: string
  category_id: string | null
  is_stock_purchase: boolean
  is_stock_cogs: boolean
  is_debt_settlement: boolean
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
        .select('amount, type, date, category_id, is_stock_purchase, is_stock_cogs, is_debt_settlement')
        .gte('date', b.prevStart)
        .lt('date', b.next)
      if (error) throw error
      return data ?? []
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
      return data ?? []
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
  /** spending that counts against budgets — isBudgetSpendingRow basis (COGS excluded) */
  budgetSpending: number
  /** days remaining in the month, including today (Asia/Bangkok calendar) */
  daysLeft: number
  /** safeToSpend / daysLeft, or 0 when safeToSpend <= 0 */
  dailyAllowance: number
  /** % change of safe-to-spend vs last month, or null when last month is empty */
  deltaPct: number | null
  /** number of income transactions this month */
  incomeCount: number
  /** number of (non-stock) expense transactions this month */
  expenseCount: number
  /** cumulative income per day of the month (index 0 = day 1) for the trend line */
  dailyCumIncome: number[]
  /** cumulative expense per day of the month (index 0 = day 1) for the trend line */
  dailyCumExpense: number[]
  /** expense grouped by category, largest first */
  donut: DonutSlice[]
}

// Donut slice colours when a category has no colour of its own. Passed as the
// `color` prop straight to the SVG, so these stay raw hex (not Tailwind classes).
// Must mirror cat.1–6 in tailwind.config.ts, in the same order.
const FALLBACK_SLICE_COLORS = ['#4A57B5', '#CE6A22', '#0D8F6A', '#9B4BB0', '#7D7708', '#BC2F60']

/**
 * Pure aggregation of the month rows into everything the home screen renders.
 * Stock purchases are treated as inventory and excluded from spending figures
 * (design spec §3, accounting model).
 */
export function computeHomeSummary(
  rows: MonthRow[],
  categories: Category[],
  now = new Date(),
): HomeSummary {
  // `now` is injectable purely so tests can pin the month with fixed dates
  // instead of sharing monthBounds() with the code under test; it defaults to
  // the current time, so runtime behaviour is unchanged.
  const b = monthBounds(now)
  const catById = new Map(categories.map((c) => [c.id, c]))

  let income = 0
  let expense = 0
  let budgetSpending = 0
  let incomeCount = 0
  let expenseCount = 0
  let prevSafe = 0
  let prevIncome = 0
  let prevExpense = 0
  const dailyCumInc = new Array<number>(b.days).fill(0)
  const dailyCum = new Array<number>(b.days).fill(0)
  const byCat = new Map<string, number>()

  for (const r of rows) {
    const inThisMonth = r.date >= b.start && r.date < b.next
    const amount = Number(r.amount) || 0
    if (inThisMonth) {
      if (isIncomeRow(r)) {
        income += amount
        incomeCount += 1
        const dayIdx = dayOfMonthISO(r.date) - 1
        if (dayIdx >= 0 && dayIdx < dailyCumInc.length) dailyCumInc[dayIdx] += amount
      } else if (isSpendingRow(r)) {
        expense += amount
        expenseCount += 1
        const dayIdx = dayOfMonthISO(r.date) - 1
        if (dayIdx >= 0 && dayIdx < dailyCum.length) dailyCum[dayIdx] += amount
        const key = r.category_id ?? 'none'
        byCat.set(key, (byCat.get(key) ?? 0) + amount)
      }
      if (isBudgetSpendingRow(r)) budgetSpending += amount
    } else {
      // previous month
      if (isIncomeRow(r)) prevIncome += amount
      else if (isSpendingRow(r)) prevExpense += amount
    }
  }
  prevSafe = prevIncome - prevExpense

  // running cumulative for the trend lines
  for (let i = 1; i < dailyCum.length; i++) dailyCum[i] += dailyCum[i - 1]
  for (let i = 1; i < dailyCumInc.length; i++) dailyCumInc[i] += dailyCumInc[i - 1]

  const safeToSpend = income - expense
  const deltaPct =
    prevSafe > 0 ? Math.round(((safeToSpend - prevSafe) / prevSafe) * 100) : null

  // Days remaining in the month, today included — the shared helper so this and
  // the budget page never disagree about "เหลือกี่วัน" (convention 10).
  const daysLeft = daysLeftInMonth(now)
  const dailyAllowance = daysLeft > 0 && safeToSpend > 0 ? safeToSpend / daysLeft : 0

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
    budgetSpending,
    daysLeft,
    dailyAllowance,
    deltaPct,
    incomeCount,
    expenseCount,
    dailyCumIncome: dailyCumInc,
    dailyCumExpense: dailyCum,
    donut,
  }
}
