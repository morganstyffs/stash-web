import { describe, it, expect } from 'vitest'
import { computePace } from '@/hooks/useBudgets'
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

describe('budget spending excludes COGS (isBudgetSpendingRow)', () => {
  // Mirrors useMonthSpending: budget spend = expense, not a stock purchase, and
  // NOT recognised COGS. A resale's cost of goods must never eat the budget.
  type BudgetRow = LedgerRow & { amount: number }
  const rows: BudgetRow[] = [
    { type: 'expense', amount: 500 }, // normal spend → counts
    { type: 'expense', is_stock_cogs: true, stock_item_id: 'x', amount: 700 }, // COGS → excluded
    { type: 'expense', is_stock_purchase: true, amount: 3_000 }, // intake → excluded
    { type: 'income', amount: 9_000 }, // income → excluded
  ]

  it('only the plain expense is counted', () => {
    expect(rows.map(isBudgetSpendingRow)).toEqual([true, false, false, false])
  })

  it('summing budget spend ignores the COGS baht entirely', () => {
    const total = rows.filter(isBudgetSpendingRow).reduce((sum, r) => sum + r.amount, 0)
    expect(total).toBe(500) // NOT 500 + 700 (COGS) and NOT + 3000 (intake)
  })
})
