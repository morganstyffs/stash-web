import { describe, it, expect } from 'vitest'
import { computeHomeSummary } from '@/lib/homeSummary'

// Dates are pinned to fixed literals (never derived from monthBounds()), so the
// test can't share a bug with the code under test — if monthBoundsFromKey()
// itself miscomputed the window, these would go red. computeHomeSummary now takes
// the month as a 'YYYY-MM' key (which month) split from `now` (what day is it);
// the `now` anchors carry an explicit +07:00 offset so "today" is reckoned in
// Bangkok, independent of the CI runner's tz.
type Rows = Parameters<typeof computeHomeSummary>[0]
const noCategories: Parameters<typeof computeHomeSummary>[1] = []
const julyKey = '2026-07'
const julyAnchor = new Date('2026-07-15T12:00:00+07:00') // mid-July, Bangkok

function row(over: Partial<Rows[number]>): Rows[number] {
  return {
    amount: 0,
    type: 'expense',
    date: '2026-07-15',
    category_id: null,
    is_stock_purchase: false,
    is_stock_cogs: false,
    is_debt_settlement: false,
    is_shop_operating: false,
    ...over,
  }
}

describe('computeHomeSummary — stock purchases are inventory, not spending', () => {
  it('excludes a stock purchase from expense and safeToSpend', () => {
    const rows: Rows = [
      row({ type: 'income', amount: 10_000 }),
      row({ type: 'expense', amount: 3_000, is_stock_purchase: true }), // buy into stock
      row({ type: 'expense', amount: 200 }), // a normal coffee
    ]
    const s = computeHomeSummary(rows, noCategories, julyKey, julyAnchor)
    expect(s.income).toBe(10_000)
    expect(s.expense).toBe(200) // the 3,000 intake is NOT counted
    expect(s.expenseCount).toBe(1) // only the coffee
    expect(s.safeToSpend).toBe(9_800)
  })
})

describe('computeHomeSummary — a completed sale moves safeToSpend by net profit', () => {
  // A sale posts two rows into the ledger: income = sale price, and a COGS
  // expense = unit cost. In the home feed the COGS row is a normal expense
  // (is_stock_purchase = false), so income − expense nets to exactly the profit.
  const baseline: Rows = [row({ type: 'income', amount: 2_000 })]

  it('a profitable sale raises safeToSpend by exactly the net profit', () => {
    const before = computeHomeSummary(baseline, noCategories, julyKey, julyAnchor)
    const withSale: Rows = [
      ...baseline,
      row({ type: 'income', amount: 1_500, category_id: 'c-sale' }), // sale income
      row({ type: 'expense', amount: 1_000 }), // COGS (cost of the sold unit)
    ]
    const after = computeHomeSummary(withSale, noCategories, julyKey, julyAnchor)
    expect(after.income).toBe(3_500)
    expect(after.expense).toBe(1_000) // COGS counts as expense
    expect(after.safeToSpend - before.safeToSpend).toBe(500) // 1500 − 1000 net profit
  })

  it('a loss-making sale lowers safeToSpend by the net loss', () => {
    const before = computeHomeSummary(baseline, noCategories, julyKey, julyAnchor)
    const withLossSale: Rows = [
      ...baseline,
      row({ type: 'income', amount: 800 }), // sold below cost
      row({ type: 'expense', amount: 1_000 }), // COGS
    ]
    const after = computeHomeSummary(withLossSale, noCategories, julyKey, julyAnchor)
    expect(after.safeToSpend - before.safeToSpend).toBe(-200) // 800 − 1000
  })
})

describe('computeHomeSummary — month membership at the Asia/Bangkok boundary', () => {
  // These pin the exact 0010-class bug: a row's `date` is the Bangkok calendar
  // day, and membership must follow that day regardless of the runner's clock.
  const augKey = '2026-08'
  const augAnchor = new Date('2026-08-10T12:00:00+07:00') // mid-August, Bangkok

  it('a transaction at 00:30 Bangkok on the 1st belongs to the NEW month', () => {
    const rows: Rows = [
      row({ type: 'income', amount: 1_000, date: '2026-08-01' }), // 00:30 ICT → Aug
      row({ type: 'expense', amount: 200, date: '2026-08-05' }),
    ]
    const s = computeHomeSummary(rows, noCategories, augKey, augAnchor)
    expect(s.income).toBe(1_000) // counted in August
    expect(s.incomeCount).toBe(1)
    expect(s.expense).toBe(200)
  })

  it('a transaction at 23:30 Bangkok on the last day belongs to the OLD month', () => {
    const rows: Rows = [
      row({ type: 'income', amount: 5_000, date: '2026-08-20' }), // clearly August
      row({ type: 'income', amount: 500, date: '2026-07-31' }), // 23:30 ICT → still July
    ]
    const s = computeHomeSummary(rows, noCategories, augKey, augAnchor)
    expect(s.income).toBe(5_000) // the 31 Jul 23:30 row is NOT in August
    expect(s.incomeCount).toBe(1)
    // it lands in the previous month instead → drives deltaPct (prevSafe = 500)
    expect(s.deltaPct).toBe(900) // (5000 − 500) / 500 × 100
  })
})

describe('computeHomeSummary — budgetSpending excludes COGS but expense keeps it', () => {
  it('a COGS row counts toward expense but NOT toward budgetSpending', () => {
    const rows: Rows = [
      row({ type: 'income', amount: 1_500, category_id: 'c-sale' }), // sale income
      row({ type: 'expense', amount: 1_000, is_stock_cogs: true }), // COGS leg
      row({ type: 'expense', amount: 200 }), // a normal budgeted expense
    ]
    const s = computeHomeSummary(rows, noCategories, julyKey, julyAnchor)
    expect(s.expense).toBe(1_200) // COGS is part of the money-out headline (rule 4)
    expect(s.budgetSpending).toBe(200) // …but the resale cost is not budgeted spending
  })

  it('a stock purchase counts toward neither expense nor budgetSpending', () => {
    const rows: Rows = [
      row({ type: 'expense', amount: 3_000, is_stock_purchase: true }), // intake
      row({ type: 'expense', amount: 200 }), // a normal budgeted expense
    ]
    const s = computeHomeSummary(rows, noCategories, julyKey, julyAnchor)
    expect(s.expense).toBe(200) // intake is inventory, excluded from spending
    expect(s.budgetSpending).toBe(200) // and likewise excluded from budget spending
  })

  it('a debt settlement counts toward expense but NOT toward budgetSpending', () => {
    const rows: Rows = [
      row({ type: 'expense', amount: 1_000, is_debt_settlement: true }), // repaying a debt
      row({ type: 'expense', amount: 200 }), // a normal budgeted expense
    ]
    const s = computeHomeSummary(rows, noCategories, julyKey, julyAnchor)
    expect(s.expense).toBe(1_200) // real money out — part of the headline (mirrors COGS)
    expect(s.budgetSpending).toBe(200) // …but repaying an owed debt is not budgeted spending
  })

  it('a shop operating cost counts toward expense but NOT toward budgetSpending', () => {
    const rows: Rows = [
      row({ type: 'expense', amount: 500, is_shop_operating: true }), // ค่าส่ง (ถังที่ 2)
      row({ type: 'expense', amount: 200 }), // a normal budgeted expense
    ]
    const s = computeHomeSummary(rows, noCategories, julyKey, julyAnchor)
    expect(s.expense).toBe(700) // running the shop is real money out — in the headline
    expect(s.budgetSpending).toBe(200) // …but it doesn't eat the personal budget
  })
})

describe('computeHomeSummary — daysLeft counts today through end of month (Bangkok)', () => {
  it('mid-month leaves the remaining days including today', () => {
    // 29 July 2026, Bangkok; July has 31 days → 31 − 29 + 1 = 3 days left.
    const s = computeHomeSummary([], noCategories, '2026-07', new Date('2026-07-29T12:00:00+07:00'))
    expect(s.daysLeft).toBe(3)
  })

  it('the last day of the month leaves exactly one day', () => {
    const s = computeHomeSummary([], noCategories, '2026-07', new Date('2026-07-31T12:00:00+07:00'))
    expect(s.daysLeft).toBe(1)
  })
})

describe('computeHomeSummary — dailyAllowance splits safe-to-spend over the days left', () => {
  it('is safeToSpend / daysLeft when safe-to-spend is positive', () => {
    // 29 July → 3 days left. income 10,000 − expense 1,000 = 9,000 → 3,000/day.
    const rows: Rows = [
      row({ type: 'income', amount: 10_000 }),
      row({ type: 'expense', amount: 1_000 }),
    ]
    const s = computeHomeSummary(rows, noCategories, '2026-07', new Date('2026-07-29T12:00:00+07:00'))
    expect(s.safeToSpend).toBe(9_000)
    expect(s.daysLeft).toBe(3)
    expect(s.dailyAllowance).toBe(3_000)
  })

  it('is 0 when safe-to-spend is negative (nothing left to allow)', () => {
    const rows: Rows = [
      row({ type: 'income', amount: 500 }),
      row({ type: 'expense', amount: 2_000 }),
    ]
    const s = computeHomeSummary(rows, noCategories, '2026-07', new Date('2026-07-29T12:00:00+07:00'))
    expect(s.safeToSpend).toBe(-1_500)
    expect(s.dailyAllowance).toBe(0)
  })
})

describe('computeHomeSummary — a past month has no days left even with money to spend', () => {
  // The trap this PR exists to prevent: viewing June while `now` is mid-July.
  // "which month" (June) is split from "what day is it" (still July), so daysLeft
  // reads 0 (June is over) instead of a plausible-looking mid-June count — and a
  // positive safeToSpend must NOT be smeared over phantom remaining days.
  it('a positive safe-to-spend in a finished month yields daysLeft = 0 and dailyAllowance = 0', () => {
    const rows: Rows = [
      row({ type: 'income', amount: 10_000, date: '2026-06-10' }),
      row({ type: 'expense', amount: 1_000, date: '2026-06-15' }),
    ]
    const s = computeHomeSummary(rows, noCategories, '2026-06', new Date('2026-07-15T12:00:00+07:00'))
    expect(s.safeToSpend).toBe(9_000) // there is money to spend…
    expect(s.daysLeft).toBe(0) // …but the month is over
    expect(s.dailyAllowance).toBe(0) // so no per-day figure, not a stale positive one
  })
})
