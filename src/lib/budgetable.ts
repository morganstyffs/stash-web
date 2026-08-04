import type { CategoryKind } from './db'

/**
 * The ONE rule for "can this category carry a monthly budget?" — a single pure
 * predicate every budget surface funnels through, so a role change lands in
 * exactly one place (convention 3).
 *
 * A budget only means something for a category whose spending actually counts
 * against the budget (isBudgetSpendingRow · lib/ledger.ts). Three whole groups
 * are carved out of budget spending upstream, so budgeting them creates a row
 * that can never move off 0% no matter how much is spent — and its amount still
 * eats into the total-budget quota:
 *
 *   1. system categories (is_system) — ต้นทุนขายสต็อก (COGS), จ่ายชำระหนี้
 *      (debt repayment): their transactions are stamped is_stock_cogs /
 *      is_debt_settlement and dropped from budget spend.
 *   2. shop categories (is_shop_category → transactions get is_shop_operating,
 *      0026) — running the shop (ถังที่ 2) is real money out but not personal
 *      budgeted spending.
 *   3. stock-refill categories (is_stock_category) — intake books
 *      is_stock_purchase (an inventory asset, not an expense).
 *
 * Budgets are also expense-only: an income category is never budgetable.
 *
 * Minimal structural param (convention 11) so tests pass plain objects and any
 * row shape carrying these four flags satisfies it.
 */
export interface BudgetableCategory {
  kind: CategoryKind
  is_system: boolean
  is_shop_category: boolean
  is_stock_category: boolean
}

export function isBudgetableCategory(c: BudgetableCategory): boolean {
  return (
    c.kind === 'expense' && !c.is_system && !c.is_shop_category && !c.is_stock_category
  )
}
