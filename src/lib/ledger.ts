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
  /** shop operating cost/income (ถังที่ 2). Copied onto the row by a DB trigger
   *  from the category's is_shop_category flag (0026); never written by the
   *  client. Optional here so display-only row shapes that don't select it
   *  (history/edit sheet, used only for lock indicators) still satisfy LedgerRow.
   */
  is_shop_operating?: boolean
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
 * Spending that counts against category budgets — like isSpendingRow but COGS,
 * debt settlements, AND shop operating costs are excluded. A resale's cost,
 * paying back a debt you already owed, and running the shop (ถังที่ 2 — ค่าส่ง /
 * บรรจุภัณฑ์ / ค่าธรรมเนียม / การตลาด) are all real money out (still in
 * isSpendingRow → the home headline) but none is discretionary personal budgeted
 * spending. is_shop_operating is a DB-derived flag (0026); the same rule is
 * mirrored server-side in useMonthSpending's query.
 */
export function isBudgetSpendingRow(r: LedgerRow): boolean {
  return isSpendingRow(r) && !r.is_stock_cogs && !r.is_debt_settlement && !r.is_shop_operating
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

// ── locked rows — ONE concept, not a second path per type ────────────────────

export type LockedKind = 'stock_purchase' | 'stock_sale' | 'debt_settlement'

export interface LockedRowInfo {
  kind: LockedKind
  /** whether the date stays editable — only a stock purchase does; a sale and a
   *  debt settlement lock the date too (a DB trigger enforces both). */
  dateEditable: boolean
  /** why it's locked + where to undo it — shown in the edit sheet. */
  reason: string
  /** label of the button that routes to the undo/manage flow. */
  actionLabel: string
  /** where that button goes. */
  actionTo: string
}

/**
 * The ONE answer to "is this row locked, why, and where do I undo it?" — stock
 * purchases/sales and debt settlements all funnel through here so the edit sheet
 * and the list indicator never grow a per-type branch (convention 3). Each row is
 * kept read-only by a DB trigger (0012 §8 for sales, 0015 §10 for settlements);
 * this is the client mirror so the user is told BEFORE they hit the trigger. A
 * new locked kind is added here once and every surface picks it up.
 */
export function lockedRowInfo(r: LedgerRow): LockedRowInfo | null {
  if (r.is_stock_purchase) {
    return {
      kind: 'stock_purchase',
      dateEditable: true,
      reason:
        'รายการนี้มาจากการซื้อเข้าสต็อก — ยอดเงินและหมวดแก้ที่หน้าคลังสินค้า ที่นี่แก้ได้เฉพาะกระเป๋า วันที่ และโน้ต',
      actionLabel: 'ไปที่คลังสินค้าเพื่อลบ',
      actionTo: '/stock',
    }
  }
  if (isSaleLinkedRow(r)) {
    return {
      kind: 'stock_sale',
      dateEditable: false,
      reason:
        'รายการนี้มาจากการขายสต็อก — ยอด หมวด และวันที่ล็อกไว้ ที่นี่แก้ได้เฉพาะกระเป๋าและโน้ต ถ้าจะแก้ต้องย้อนการขายที่หน้าคลังสินค้า',
      actionLabel: 'ไปที่คลังสินค้าเพื่อย้อนการขาย',
      actionTo: '/stock',
    }
  }
  if (r.is_debt_settlement) {
    return {
      kind: 'debt_settlement',
      dateEditable: false,
      reason:
        'รายการนี้มาจากการเคลียร์ยอดค้าง — ยอด หมวด และวันที่ล็อกไว้ ที่นี่แก้ได้เฉพาะกระเป๋าและโน้ต ถ้าจะย้อนต้องไปที่หน้ายอดค้าง',
      actionLabel: 'ไปที่ยอดค้างเพื่อย้อนการเคลียร์',
      actionTo: '/debts',
    }
  }
  return null
}

/** Whether a row is locked at all (amount + category are never editable inline). */
export function isLockedRow(r: LedgerRow): boolean {
  return lockedRowInfo(r) !== null
}
