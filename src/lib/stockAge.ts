/**
 * Stock-age money logic — the single source of truth for "how old is too old"
 * and the ทุนจม (sunk-cost) figure derived from it. Lives in `lib/` (not
 * StockPage) so a non-React caller — the AI worker — can import it too.
 *
 * lib/ เดินทางเดียว ห้าม import จาก hooks/ หรือ pages/ (§3) → รับ "รูปร่างขั้นต่ำ"
 * structural แทน. ตัวจับเวลา ("วันนี้") ฉีดผ่านพารามิเตอร์ `now` ทุกตัว.
 */
import { daysSince } from '@/lib/dates'
import type { StockItem } from '@/lib/db'

// ── stock-age thresholds — the single source of truth (spec §อายุสต็อก) ───────
// Tune here and here only: ≤30 days = fresh (grey spine, no flag), 31–60 =
// aging (amber, "ค้าง N วัน"), >60 = old (red, "ค้าง N วัน"). These are an
// educated guess for second-hand clothing, not measured from real turnover —
// if stock usually clears in ~2 weeks, drop them.
export const AGE_FRESH_MAX = 30
export const AGE_OLD_MAX = 60

/** True when an item is still on the rack (any non-sold status). The single
 *  definition of "still in stock" — StockPage's list/count helpers and `isStale`
 *  both import it, so adding a new stock status can never let the page and the
 *  bell/ทุนจม disagree about what counts (convention 11). */
export function inStock(it: Pick<StockItem, 'status'>): boolean {
  return it.status !== 'sold'
}

/** "ค้างนาน" — in stock and older than the aging cap (spec: in-stock & >60 days).
 *  Exported: the header bell's attention counter reuses this exact predicate
 *  against a narrower row shape than the full Stock page query. */
export function isStale(it: Pick<StockItem, 'status' | 'created_at'>, now: Date): boolean {
  return inStock(it) && daysSince(it.created_at, now) > AGE_OLD_MAX
}

/**
 * ทุนจม — cost tied up in stock that's been sitting past the "ค้างนาน" cap
 * (spec §ทุนจม): sum of cost × qty_remaining for every item `isStale` marks
 * (in-stock AND older than AGE_OLD_MAX). Shares `isStale` with the "ค้างนาน"
 * chip on purpose — one definition of the age boundary, so the number can never
 * disagree with the chip about which items count. Real money that's stuck, not
 * a hoped-for profit — it answers "where did the cash go" / "stop buying in".
 */
export function computeSunkCost(items: StockItem[], now: Date = new Date()): number {
  let sunk = 0
  for (const it of items) {
    if (!isStale(it, now)) continue
    sunk += (Number(it.cost_per_unit) || 0) * (it.qty_remaining ?? 0)
  }
  return sunk
}
