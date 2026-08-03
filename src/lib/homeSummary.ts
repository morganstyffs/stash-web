/**
 * Pure aggregation of a month's transaction rows into everything the home screen
 * renders. Lives in `lib/` (not the `useHome` hook) so a non-React caller — the
 * AI worker — can import it too.
 *
 * lib/ เดินทางเดียว ห้าม import จาก hooks/ (§3) → รับ "รูปร่างขั้นต่ำ" structural
 * (`HomeSummaryRow`) แทน ไม่ต้องรู้จัก `MonthRow` ใน useHome.ts. `MonthRow[]` ของ
 * hook satisfies โครงนี้อยู่แล้ว (โครงสร้าง identical) จึงส่งเข้ามาได้ตรง ๆ.
 */
import { daysLeftInMonthKey, monthBoundsFromKey, monthKey } from '@/lib/dates'
import { isBudgetSpendingRow, isIncomeRow, isSpendingRow } from '@/lib/ledger'
import type { Category, TransactionType } from '@/lib/db'

/** Minimal transaction shape the home aggregates read — the structural echo of
 *  useHome's `MonthRow`, kept here so lib/ never has to import the hook. */
export interface HomeSummaryRow {
  amount: number
  type: TransactionType
  date: string
  category_id: string | null
  is_stock_purchase: boolean
  is_stock_cogs: boolean
  is_debt_settlement: boolean
  /** shop operating cost/income (ถังที่ 2) — DB-derived (0026). Feeds
   *  isBudgetSpendingRow so shop costs don't eat the personal budget. */
  is_shop_operating: boolean
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
  rows: HomeSummaryRow[],
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
