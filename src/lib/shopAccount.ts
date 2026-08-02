/**
 * The shop P&L formula — the ONE place that turns the two buckets into a net
 * figure, so no component does money arithmetic (mirrors lib/debtsSummary.ts /
 * lib/spendable.ts). Nothing here reads from the DB or masks; it takes numbers in
 * and returns numbers out.
 *
 *   ยอดขาย − ต้นทุนที่ขายไป = กำไรขั้นต้น        ← ถังที่ 1 (stock_sales)
 *                          − ค่าดำเนินร้าน       ← ถังที่ 2 (is_shop_operating)
 *                          = กำไรสุทธิ
 *
 * ถังที่ 2 nets both sides: shipping collected from customers (income) offsets
 * shipping/packaging/fees/marketing actually paid (expense). operatingNet is the
 * NET cost of running the shop — positive when you pay more than you collect,
 * negative when you collect more than you pay (which lifts net profit ABOVE gross).
 */
export interface ShopProfit {
  /** stock_sales_summary.profit — realised gross profit (ถังที่ 1). */
  grossProfit: number
  /** shopExpense − shopIncome: >0 = paid more than collected (a real cost). */
  operatingNet: number
  /** grossProfit − operatingNet. May be negative (a loss) — never clamped. */
  netProfit: number
}

/**
 * Compose the net figure. No clamping: a loss stays negative so the card can show
 * it with a warning instead of a comforting fake ฿0 (convention: never clamp money).
 */
export function computeShopProfit(input: {
  grossProfit: number
  shopIncome: number
  shopExpense: number
}): ShopProfit {
  const operatingNet = input.shopExpense - input.shopIncome
  return {
    grossProfit: input.grossProfit,
    operatingNet,
    netProfit: input.grossProfit - operatingNet,
  }
}
