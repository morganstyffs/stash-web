import { describe, it, expect } from 'vitest'
import {
  budgetableRows,
  computeBudgetSummary,
  computePace,
  computePaceStatic,
  type BudgetRow,
} from '@/hooks/useBudgets'
import { isBudgetSpendingRow, type LedgerRow } from '@/lib/ledger'

describe('computePace — over budget', () => {
  it('flags "over" whenever used exceeds budget (independent of the date)', () => {
    const p = computePace(1_200, 1_000, new Date('2026-01-15T12:00:00+07:00'))
    expect(p.state).toBe('over')
    expect(p.ratio).toBeCloseTo(1.2)
    expect(p.pct).toBe(120)
  })

  it('reports the real overshoot in `over`, never clamped to 0 (remaining goes negative)', () => {
    const p = computePace(1_200, 1_000, new Date('2026-01-15T12:00:00+07:00'))
    expect(p.over).toBe(200)
    expect(p.remaining).toBe(-200) // budget − used, shown as-is
  })
})

describe('computePace — nothing spent yet ("unused")', () => {
  it('flags "unused" when used is 0 but a budget is set (whatever the date)', () => {
    // Day 20 of Jan: elapsed is high, but with 0 spent this must NOT read "fast"
    // or "on_track with a scary number" — just "ยังไม่ได้ใช้".
    const p = computePace(0, 1_000, new Date('2026-01-20T12:00:00+07:00'))
    expect(p.state).toBe('unused')
    expect(p.remaining).toBe(1_000)
    expect(p.over).toBe(0)
    expect(p.pct).toBe(0)
  })
})

describe('computePace — normal on_track carries the remaining figure', () => {
  it('on_track exposes remaining = budget − used', () => {
    const p = computePace(500, 10_000, new Date('2026-01-02T12:00:00+07:00'))
    expect(p.state).toBe('on_track')
    expect(p.remaining).toBe(9_500)
    expect(p.over).toBe(0)
  })
})

describe('computePaceStatic — closed month never flags "fast"', () => {
  it('the same fast-looking numbers read on_track once the month is closed', () => {
    // used 0.5 of budget early would be 'fast' live; a closed month has no days
    // left to outrun, so it must be on_track with the remaining figure.
    const live = computePace(500, 1_000, new Date('2026-01-10T12:00:00+07:00'))
    expect(live.state).toBe('fast')
    const closed = computePaceStatic(500, 1_000)
    expect(closed.state).toBe('on_track')
    expect(closed.remaining).toBe(500)
  })

  it('still flags over / unused (date-independent) for a closed month', () => {
    expect(computePaceStatic(1_200, 1_000).state).toBe('over')
    expect(computePaceStatic(1_200, 1_000).over).toBe(200)
    expect(computePaceStatic(0, 1_000).state).toBe('unused')
  })
})

describe('computePace — pace vs elapsed month (date injected)', () => {
  it('flags "fast" when spending outruns the elapsed fraction but is under budget', () => {
    // Jan (31 days), day 10 → elapsed ≈ 0.323, threshold ≈ 0.355.
    // ratio 0.5 > threshold and still under budget → fast.
    const p = computePace(500, 1_000, new Date('2026-01-10T12:00:00+07:00'))
    expect(p.state).toBe('fast')
    expect(p.pct).toBe(50)
  })

  it('flags "on_track" when spending is within the elapsed pace', () => {
    // Jan day 20 → elapsed ≈ 0.645. ratio 0.3 is well under → on_track.
    const p = computePace(300, 1_000, new Date('2026-01-20T12:00:00+07:00'))
    expect(p.state).toBe('on_track')
    expect(p.pct).toBe(30)
  })

  it('treats a zero budget as on_track with ratio 0 (no divide-by-zero)', () => {
    const p = computePace(500, 0, new Date('2026-01-10T12:00:00+07:00'))
    expect(p.state).toBe('on_track')
    expect(p.ratio).toBe(0)
    expect(p.pct).toBe(0)
  })
})

describe('computeBudgetSummary — remaining compares like with like (B5)', () => {
  it('no budget set: everything spent is off-budget, nothing budgeted', () => {
    const s = computeBudgetSummary([], { food: 500, transport: 300 })
    expect(s.totalBudget).toBe(0)
    expect(s.usedInBudgeted).toBe(0)
    expect(s.offBudget).toBe(800)
    expect(s.offBudgetCount).toBe(2)
    expect(s.remaining).toBe(0)
  })

  it('budget set but nothing spent yet: full budget remains', () => {
    const s = computeBudgetSummary([{ category_id: 'food', amount: 1_000 }], {})
    expect(s.totalBudget).toBe(1_000)
    expect(s.usedInBudgeted).toBe(0)
    expect(s.offBudget).toBe(0)
    expect(s.offBudgetCount).toBe(0)
    expect(s.remaining).toBe(1_000)
  })

  it('spending only in un-budgeted categories does NOT eat the budget (the B5 bug)', () => {
    // One budget on food (unspent); all the money went to transport + fun, which
    // have no budget. Remaining must stay +1,000, not go red.
    const s = computeBudgetSummary(
      [{ category_id: 'food', amount: 1_000 }],
      { transport: 700, fun: 300 },
    )
    expect(s.usedInBudgeted).toBe(0)
    expect(s.offBudget).toBe(1_000)
    expect(s.offBudgetCount).toBe(2)
    expect(s.remaining).toBe(1_000) // NOT 1000 - 1000 = 0
  })

  it('over budget: remaining goes negative, shown as-is (never clamped)', () => {
    const s = computeBudgetSummary(
      [{ category_id: 'food', amount: 1_000 }],
      { food: 1_300, transport: 200 },
    )
    expect(s.totalBudget).toBe(1_000)
    expect(s.usedInBudgeted).toBe(1_300)
    expect(s.offBudget).toBe(200)
    expect(s.offBudgetCount).toBe(1)
    expect(s.remaining).toBe(-300)
  })

  it('a zero-spend off-budget key is not counted toward offBudgetCount', () => {
    const s = computeBudgetSummary([{ category_id: 'food', amount: 500 }], {
      transport: 0,
      fun: 120,
    })
    expect(s.offBudget).toBe(120)
    expect(s.offBudgetCount).toBe(1) // transport (0) excluded
  })
})

describe('budgetableRows — the one filter home + budget page share', () => {
  // A budget row carrying its category flags; overrides pick the excluded groups.
  const row = (
    category_id: string,
    amount: number,
    cat: Partial<NonNullable<BudgetRow['category']>> = {},
  ): BudgetRow => ({
    id: `b-${category_id}`,
    category_id,
    amount,
    category: {
      name: category_id,
      icon: '💸',
      color_index: 0,
      kind: 'expense',
      is_system: false,
      is_shop_category: false,
      is_stock_category: false,
      ...cat,
    },
  })

  // One mixed data set reused by every assertion below: two real expense budgets
  // plus one of each non-budgetable group (system COGS, shop ถังที่ 2, stock refill,
  // income) — the exact rows that inflated the home total before this fix.
  const rows: BudgetRow[] = [
    row('food', 1_000),
    row('rent', 2_000),
    row('cogs', 5_000, { is_system: true }), // ต้นทุนขายสต็อก — excluded
    row('shop', 800, { is_shop_category: true }), // ถังที่ 2 — excluded
    row('stock', 3_000, { is_stock_category: true }), // เติมสต็อก — excluded
    row('salary', 9_000, { kind: 'income' }), // income — excluded
  ]

  it('keeps only expense, non-system/shop/stock rows (all three groups + income drop)', () => {
    expect(budgetableRows(rows).map((r) => r.category_id)).toEqual(['food', 'rent'])
  })

  it('drops a row whose category join is null (no flags to trust → not budgetable)', () => {
    const orphan: BudgetRow = { id: 'x', category_id: 'gone', amount: 500, category: null }
    expect(budgetableRows([orphan])).toEqual([])
  })

  it('home "งบที่ตั้งไว้" total ignores system/shop/stock/income budget rows', () => {
    // The number useMonthBudgetTotal returns = sum over budgetableRows.
    const homeTotal = budgetableRows(rows).reduce((s, r) => s + r.amount, 0)
    expect(homeTotal).toBe(3_000) // 1,000 + 2,000 — NOT + 5,000 + 800 + 3,000 + 9,000
    // Proof the filter earns its keep: the naïve unfiltered sum was wildly off.
    const unfiltered = rows.reduce((s, r) => s + r.amount, 0)
    expect(unfiltered).toBe(20_800)
    expect(homeTotal).not.toBe(unfiltered)
  })

  it('home total === budget page totalBudget for the SAME data set (the heart of the fix)', () => {
    // Home: sum over budgetableRows (what useMonthBudgetTotal computes).
    const homeTotal = budgetableRows(rows).reduce((s, r) => s + r.amount, 0)
    // Budget page: computeBudgetSummary over the SAME budgetableRows (what BudgetPage
    // feeds it after budgetableRows(allBudgets)). Both surfaces funnel through the
    // one filter, so they can never disagree.
    const pageTotal = computeBudgetSummary(budgetableRows(rows), {}).totalBudget
    expect(homeTotal).toBe(pageTotal)
    expect(homeTotal).toBe(3_000)
  })
})

describe('budget spending excludes COGS + debt settlements + shop costs (isBudgetSpendingRow)', () => {
  // Mirrors useMonthSpending's SQL: budget spend = expense, not a stock purchase,
  // NOT recognised COGS, NOT a debt settlement, and NOT a shop operating cost. A
  // resale's cost of goods, a debt repayment, and running the shop must never eat
  // the personal budget.
  type BudgetRow = LedgerRow & { amount: number }
  const rows: BudgetRow[] = [
    { type: 'expense', amount: 500 }, // normal spend → counts
    { type: 'expense', is_stock_cogs: true, stock_item_id: 'x', amount: 700 }, // COGS → excluded
    { type: 'expense', is_debt_settlement: true, amount: 400 }, // debt repayment → excluded
    { type: 'expense', is_shop_operating: true, amount: 250 }, // ค่าส่ง (ถังที่ 2) → excluded
    { type: 'expense', is_stock_purchase: true, amount: 3_000 }, // intake → excluded
    { type: 'income', amount: 9_000 }, // income → excluded
  ]

  it('only the plain expense is counted', () => {
    expect(rows.map(isBudgetSpendingRow)).toEqual([true, false, false, false, false, false])
  })

  it('summing budget spend ignores COGS + debt + shop baht entirely', () => {
    const total = rows.filter(isBudgetSpendingRow).reduce((sum, r) => sum + r.amount, 0)
    expect(total).toBe(500) // NOT + 700 (COGS), + 400 (debt), + 250 (shop), or + 3000 (intake)
  })
})
