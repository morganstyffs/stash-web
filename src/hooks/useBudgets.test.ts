import { describe, it, expect } from 'vitest'
import { computeBudgetSummary, computePace } from '@/hooks/useBudgets'
import { isBudgetSpendingRow, type LedgerRow } from '@/lib/ledger'

describe('computePace — over budget', () => {
  it('flags "over" whenever used exceeds budget (independent of the date)', () => {
    const p = computePace(1_200, 1_000, new Date('2026-01-15T12:00:00+07:00'))
    expect(p.state).toBe('over')
    expect(p.ratio).toBeCloseTo(1.2)
    expect(p.pct).toBe(120)
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

describe('budget spending excludes COGS + debt settlements (isBudgetSpendingRow)', () => {
  // Mirrors useMonthSpending: budget spend = expense, not a stock purchase,
  // NOT recognised COGS, and NOT a debt settlement. A resale's cost of goods and
  // a debt repayment must never eat the budget.
  type BudgetRow = LedgerRow & { amount: number }
  const rows: BudgetRow[] = [
    { type: 'expense', amount: 500 }, // normal spend → counts
    { type: 'expense', is_stock_cogs: true, stock_item_id: 'x', amount: 700 }, // COGS → excluded
    { type: 'expense', is_debt_settlement: true, amount: 400 }, // debt repayment → excluded
    { type: 'expense', is_stock_purchase: true, amount: 3_000 }, // intake → excluded
    { type: 'income', amount: 9_000 }, // income → excluded
  ]

  it('only the plain expense is counted', () => {
    expect(rows.map(isBudgetSpendingRow)).toEqual([true, false, false, false, false])
  })

  it('summing budget spend ignores the COGS + debt-settlement baht entirely', () => {
    const total = rows.filter(isBudgetSpendingRow).reduce((sum, r) => sum + r.amount, 0)
    expect(total).toBe(500) // NOT + 700 (COGS), + 400 (debt), or + 3000 (intake)
  })
})
