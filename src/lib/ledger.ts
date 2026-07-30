/**
 * Central ledger predicates — the single source of truth for classifying a
 * transaction row. Every hook that filters/aggregates transactions imports from
 * here instead of inlining the flags, so a rule change lands in exactly one
 * place. Mirrors the accounting model enforced in SQL (0012 stock sale).
 */
export interface LedgerRow {
  type: 'income' | 'expense'
  is_stock_purchase?: boolean
  is_stock_cogs?: boolean
  is_debt_settlement?: boolean
  stock_item_id?: string | null
}

/** Money coming in (includes stock-sale income). */
export function isIncomeRow(r: LedgerRow): boolean {
  return r.type === 'income'
}

/**
 * Discretionary spending for the home headline / trend / donut. Excludes stock
 * PURCHASES (inventory asset) but INCLUDES recognised COGS and debt settlements
 * — under Model A, COGS is a real expense; netted against the sale income it
 * leaves only profit, so `income − spending` stays correct without a separate
 * COGS term. A debt settlement is likewise real money leaving your wallet. Both
 * count as spending here but are excluded from budgets (see isBudgetSpendingRow).
 */
export function isSpendingRow(r: LedgerRow): boolean {
  return r.type === 'expense' && !r.is_stock_purchase
}

/**
 * Spending that counts against category budgets — like isSpendingRow but COGS
 * and debt settlements are excluded (a resale's cost, and paying back a debt
 * you already owed, are not discretionary budgeted spending this month).
 */
export function isBudgetSpendingRow(r: LedgerRow): boolean {
  return isSpendingRow(r) && !r.is_stock_cogs && !r.is_debt_settlement
}

/** Transaction created by an intake PURCHASE (managed on the stock screen). */
export function isIntakeRow(r: LedgerRow): boolean {
  return !!r.is_stock_purchase
}

/**
 * Transaction created by a SALE (the income leg or the COGS leg). These are
 * read-only in the ledger UI and can only be undone via stock_sale_reverse — a
 * DB trigger enforces it (0012 SECTION 8).
 */
export function isSaleLinkedRow(r: LedgerRow): boolean {
  return !!r.is_stock_cogs || (r.type === 'income' && r.stock_item_id != null)
}

/**
 * Any transaction tied to stock (purchase, COGS, or sale income). Its amount and
 * category are managed by the stock flows, not editable as a plain ledger row.
 */
export function isStockLinkedRow(r: LedgerRow): boolean {
  return !!r.is_stock_purchase || !!r.is_stock_cogs || r.stock_item_id != null
}
