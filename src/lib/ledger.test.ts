import { describe, it, expect } from 'vitest'
import {
  isIncomeRow,
  isSpendingRow,
  isBudgetSpendingRow,
  isIntakeRow,
  isSaleLinkedRow,
  isStockLinkedRow,
  lockedRowInfo,
  isLockedRow,
  type LedgerRow,
} from '@/lib/ledger'

/**
 * The five real kinds of ledger row this app produces. Every predicate test
 * below is asserted against these, so the classification is pinned end to end.
 */
const salary: LedgerRow = { type: 'income' } // plain income
const coffee: LedgerRow = { type: 'expense' } // plain discretionary expense
const intake: LedgerRow = { type: 'expense', is_stock_purchase: true } // buying into stock
const cogs: LedgerRow = { type: 'expense', is_stock_cogs: true, stock_item_id: 'item-1' } // sale cost leg
const saleIncome: LedgerRow = { type: 'income', stock_item_id: 'item-1' } // sale income leg
const debtSettle: LedgerRow = { type: 'expense', is_debt_settlement: true } // paying back a debt

describe('isIncomeRow', () => {
  it('is true only for income rows (incl. sale income)', () => {
    expect(isIncomeRow(salary)).toBe(true)
    expect(isIncomeRow(saleIncome)).toBe(true)
    expect(isIncomeRow(coffee)).toBe(false)
    expect(isIncomeRow(intake)).toBe(false)
    expect(isIncomeRow(cogs)).toBe(false)
  })
})

describe('isSpendingRow (home headline / trend / donut)', () => {
  it('excludes stock PURCHASES but INCLUDES recognised COGS and debt settlements', () => {
    expect(isSpendingRow(coffee)).toBe(true)
    expect(isSpendingRow(cogs)).toBe(true) // COGS is a real expense under Model A
    expect(isSpendingRow(debtSettle)).toBe(true) // real money leaving the wallet
    expect(isSpendingRow(intake)).toBe(false) // inventory asset, not spending
    expect(isSpendingRow(salary)).toBe(false)
    expect(isSpendingRow(saleIncome)).toBe(false)
  })
})

describe('isBudgetSpendingRow (counts against category budgets)', () => {
  it('is like isSpendingRow but ALSO excludes COGS and debt settlements', () => {
    expect(isBudgetSpendingRow(coffee)).toBe(true)
    expect(isBudgetSpendingRow(cogs)).toBe(false) // a resale cost is not budgeted spending
    expect(isBudgetSpendingRow(debtSettle)).toBe(false) // repaying an owed debt is not budgeted spending
    expect(isBudgetSpendingRow(intake)).toBe(false)
    expect(isBudgetSpendingRow(salary)).toBe(false)
    expect(isBudgetSpendingRow(saleIncome)).toBe(false)
  })
})

describe('isIntakeRow', () => {
  it('is true only for stock-purchase rows', () => {
    expect(isIntakeRow(intake)).toBe(true)
    expect(isIntakeRow(coffee)).toBe(false)
    expect(isIntakeRow(cogs)).toBe(false)
    expect(isIntakeRow(saleIncome)).toBe(false)
  })
})

describe('isSaleLinkedRow (read-only, reverse-only)', () => {
  it('is true for the COGS leg and the sale-income leg, not a plain intake', () => {
    expect(isSaleLinkedRow(cogs)).toBe(true)
    expect(isSaleLinkedRow(saleIncome)).toBe(true)
    expect(isSaleLinkedRow(intake)).toBe(false) // a purchase is not a sale
    expect(isSaleLinkedRow(coffee)).toBe(false)
    expect(isSaleLinkedRow(salary)).toBe(false)
  })

  it('does not treat plain income without a stock_item_id as sale-linked', () => {
    expect(isSaleLinkedRow({ type: 'income', stock_item_id: null })).toBe(false)
  })
})

describe('isStockLinkedRow (managed by stock flows)', () => {
  it('is true for intake, COGS, and sale income', () => {
    expect(isStockLinkedRow(intake)).toBe(true)
    expect(isStockLinkedRow(cogs)).toBe(true)
    expect(isStockLinkedRow(saleIncome)).toBe(true)
    expect(isStockLinkedRow(coffee)).toBe(false)
    expect(isStockLinkedRow(salary)).toBe(false)
  })
})

describe('lockedRowInfo (one concept: locked? why? where to undo?)', () => {
  it('returns null for plain, editable rows', () => {
    expect(lockedRowInfo(salary)).toBeNull()
    expect(lockedRowInfo(coffee)).toBeNull()
    expect(isLockedRow(coffee)).toBe(false)
  })

  it('a stock purchase locks amount+category but keeps the date, routes to stock', () => {
    const info = lockedRowInfo(intake)
    expect(info?.kind).toBe('stock_purchase')
    expect(info?.dateEditable).toBe(true)
    expect(info?.actionTo).toBe('/stock')
  })

  it('a stock sale (COGS or income leg) locks the date too, routes to stock reverse', () => {
    for (const row of [cogs, saleIncome]) {
      const info = lockedRowInfo(row)
      expect(info?.kind).toBe('stock_sale')
      expect(info?.dateEditable).toBe(false)
      expect(info?.actionTo).toBe('/stock')
    }
  })

  it('a debt settlement locks the date and routes to ยอดค้าง — same concept, new kind', () => {
    const info = lockedRowInfo(debtSettle)
    expect(info?.kind).toBe('debt_settlement')
    expect(info?.dateEditable).toBe(false)
    expect(info?.actionTo).toBe('/debts')
    expect(isLockedRow(debtSettle)).toBe(true)
  })
})
