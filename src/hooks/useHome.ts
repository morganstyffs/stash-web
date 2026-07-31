import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { daysLeftInMonthKey, monthBoundsFromKey, monthKey } from '@/lib/dates'
import { isBudgetSpendingRow, isIncomeRow, isSpendingRow } from '@/lib/ledger'
import type { Category, TransactionType } from '@/lib/db'

/** The recent list is capped here (also the cache-warm slice in useAddTransaction). */
export const RECENT_LIMIT = 8

/** Minimal transaction shape used by the home aggregates. */
export interface MonthRow {
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
  category: { name: string; icon: string; color_index: number } | null
}

/**
 * Raw transactions from the start of *last* month up to now — enough to derive
 * this month's in/out, safe-to-spend, the daily trend, the category donut, and
 * the month-over-month delta, all from a single query.
 */
export function useMonthTransactions(month: string = monthKey()) {
  const { user } = useAuth()
  const b = monthBoundsFromKey(month)
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

/**
 * The latest handful of transactions for the "รายการล่าสุด" list.
 *
 * limit is a constant (not a queryKey part) so useAddTransaction can warm this
 * cache without first reading the limit back out of the key. Sole caller is
 * HomePage; a caller that ever needs a different size must revisit that write.
 */
export function useRecentTransactions() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['transactions', 'recent', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<RecentRow[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select(
          'id, type, amount, date, note, created_at, category:categories(name, icon, color_index)',
        )
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT)
      if (error) throw error
      return data ?? []
    },
  })
}

export interface DonutSlice {
  categoryId: string
  name: string
  /** category colour slot 1–6, or null for the uncategorised bucket (→ neutral) */
  colorIndex: number | null
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
  /** expense grouped by category, largest first */
  donut: DonutSlice[]
}

/**
 * Pure aggregation of the month rows into everything the home screen renders.
 * Stock purchases are treated as inventory and excluded from spending figures
 * (design spec §3, accounting model).
 */
export function computeHomeSummary(
  rows: MonthRow[],
  categories: Category[],
  month: string = monthKey(),
  now: Date = new Date(),
): HomeSummary {
  // `month` ("which month") is split from `now` ("what day is it"): they agree
  // for the current month but diverge for a past one, where daysLeft must read 0
  // rather than a plausible-looking mid-month count. Both default to the present,
  // so runtime behaviour is unchanged.
  const b = monthBoundsFromKey(month)
  const catById = new Map(categories.map((c) => [c.id, c]))

  let income = 0
  let expense = 0
  let budgetSpending = 0
  let incomeCount = 0
  let expenseCount = 0
  let prevSafe = 0
  let prevIncome = 0
  let prevExpense = 0
  const byCat = new Map<string, number>()

  for (const r of rows) {
    const inThisMonth = r.date >= b.start && r.date < b.next
    const amount = Number(r.amount) || 0
    if (inThisMonth) {
      if (isIncomeRow(r)) {
        income += amount
        incomeCount += 1
      } else if (isSpendingRow(r)) {
        expense += amount
        expenseCount += 1
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

  const safeToSpend = income - expense
  const deltaPct =
    prevSafe > 0 ? Math.round(((safeToSpend - prevSafe) / prevSafe) * 100) : null

  // Days remaining in the month, today included — the shared helper so this and
  // the budget page never disagree about "เหลือกี่วัน" (convention 10). Keyed on
  // `month`: a past month is over → 0, so dailyAllowance can't show a stale figure.
  const daysLeft = daysLeftInMonthKey(month, now)
  const dailyAllowance = daysLeft > 0 && safeToSpend > 0 ? safeToSpend / daysLeft : 0

  const donut: DonutSlice[] = [...byCat.entries()]
    .map(([id, total]) => {
      const cat = catById.get(id)
      return {
        categoryId: id,
        name: cat?.name ?? 'อื่นๆ',
        colorIndex: cat?.color_index ?? null,
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
    donut,
  }
}
