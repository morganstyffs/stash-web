import { describe, it, expect } from 'vitest'
import { isBudgetableCategory, type BudgetableCategory } from '@/lib/budgetable'

/**
 * The one gate on "can this category carry a budget?". A budget only tracks
 * spending that counts against the budget (isBudgetSpendingRow), so the three
 * carved-out groups — system, shop (ถังที่ 2), stock-refill — must all fail, and
 * budgets are expense-only so income fails too. A plain expense passes.
 */

const cat = (over: Partial<BudgetableCategory>): BudgetableCategory => ({
  kind: 'expense',
  is_system: false,
  is_shop_category: false,
  is_stock_category: false,
  ...over,
})

describe('isBudgetableCategory — the three excluded groups all fail', () => {
  it('rejects a system category (ต้นทุนขายสต็อก / จ่ายชำระหนี้)', () => {
    expect(isBudgetableCategory(cat({ is_system: true }))).toBe(false)
  })

  it('rejects a shop category (ถังที่ 2 — is_shop_category)', () => {
    expect(isBudgetableCategory(cat({ is_shop_category: true }))).toBe(false)
  })

  it('rejects a stock-refill category (is_stock_category)', () => {
    expect(isBudgetableCategory(cat({ is_stock_category: true }))).toBe(false)
  })
})

describe('isBudgetableCategory — expense-only, both sides', () => {
  it('accepts a plain expense category', () => {
    expect(isBudgetableCategory(cat({ kind: 'expense' }))).toBe(true)
  })

  it('rejects a plain income category (budgets are expense-only)', () => {
    expect(isBudgetableCategory(cat({ kind: 'income' }))).toBe(false)
  })

  it('rejects an income category even without any role flag set', () => {
    expect(
      isBudgetableCategory({
        kind: 'income',
        is_system: false,
        is_shop_category: false,
        is_stock_category: false,
      }),
    ).toBe(false)
  })
})
