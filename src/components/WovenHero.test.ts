import { describe, it, expect } from 'vitest'
import {
  budgetMini,
  budgetOverAmount,
  budgetSubline,
  deltaChip,
  overBudgetChip,
  safeBig,
  safeMini,
  safeSubline,
  stockSubline,
} from '@/components/WovenHero'
import { formatBaht } from '@/lib/format'
import type { SalesSummary } from '@/hooks/useStockSales'

// These cover the pure text-selection edge cases the spec calls out — the same
// numbers a real hook would feed in, so a wrong branch shows up as wrong copy.

const sales = (over: Partial<SalesSummary> = {}): SalesSummary => ({
  revenue: 0,
  cogs: 0,
  profit: 0,
  sale_count: 0,
  qty_sold: 0,
  ...over,
})

describe('safe label', () => {
  it('keeps the daily-average clause on a normal day', () => {
    expect(safeSubline(9_000, 10, 900)).toBe(
      `เหลืออีก 10 วัน · เฉลี่ยวันละ ${formatBaht(900)}`,
    )
  })

  it('drops the daily-average clause when safeToSpend is negative (never clamped)', () => {
    // over-spent: show the figure as-is and only "N days left", no average
    expect(safeSubline(-1_500, 10, 0)).toBe('เหลืออีก 10 วัน')
    expect(safeBig(-1_500, false)).toBe(formatBaht(-1_500))
  })

  it('drops the daily-average clause once the month is over', () => {
    expect(safeSubline(5_000, 0, 0)).toBe('เหลืออีก 0 วัน')
  })

  it('masks both the headline and the folded figure while hidden', () => {
    expect(safeBig(9_000, true)).toBe('฿ ••••••')
    expect(safeMini(9_000, true)).toBe('••••')
    // and reveals them when not hidden
    expect(safeBig(9_000, false)).toBe(formatBaht(9_000))
    expect(safeMini(9_000, false)).toBe(formatBaht(9_000))
  })
})

describe('budget label', () => {
  it('prompts to set a budget when none exists, with no over-chip', () => {
    expect(budgetSubline(0, 0)).toEqual({ unset: true, text: 'ยังไม่ได้ตั้งงบ' })
    expect(overBudgetChip(0, 0)).toBeNull()
    expect(budgetOverAmount(0, 5_000)).toBeNull()
  })

  it('reports spending (COGS excluded copy) when a budget is set', () => {
    expect(budgetSubline(10_000, 4_000)).toEqual({
      unset: false,
      text: `ใช้ไปแล้ว ${formatBaht(4_000)} (ไม่รวมต้นทุนขาย)`,
    })
  })

  it('surfaces the overshoot on the chip and the folded figure when over', () => {
    expect(budgetOverAmount(10_000, 12_500)).toBe(2_500)
    expect(overBudgetChip(10_000, 12_500)).toBe(`เกินงบ ${formatBaht(2_500)}`)
    expect(budgetMini(10_000, 12_500)).toBe(`เกิน ${formatBaht(2_500)}`)
  })

  it('shows the budget total on the folded figure while within budget', () => {
    expect(overBudgetChip(10_000, 4_000)).toBeNull()
    expect(budgetMini(10_000, 4_000)).toBe(formatBaht(10_000))
  })
})

describe('stock label', () => {
  it('shows an empty-state when nothing sold this month', () => {
    expect(stockSubline(sales({ qty_sold: 0 }))).toBe('ยังไม่มีการขายเดือนนี้')
  })

  it('breaks down revenue / cost / units once there are sales', () => {
    expect(stockSubline(sales({ revenue: 3_000, cogs: 1_200, qty_sold: 4, profit: 1_800 }))).toBe(
      `ขาย ${formatBaht(3_000)} · ต้นทุน ${formatBaht(1_200)} · 4 ชิ้น`,
    )
  })
})

describe('delta chip', () => {
  it('is absent when there is no comparison basis', () => {
    expect(deltaChip(null)).toBeNull()
  })

  it('points up for an improvement and down for a decline', () => {
    expect(deltaChip(12)).toEqual({ up: true, text: '12% ดีกว่าเดือนก่อน' })
    expect(deltaChip(-8)).toEqual({ up: false, text: '8% ต่ำกว่าเดือนก่อน' })
  })
})
