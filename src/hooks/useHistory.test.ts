import { describe, it, expect } from 'vitest'
import { toSearchPage, EMPTY_TOTALS, type HistoryRow } from '@/hooks/useHistory'
import type { Database } from '@/lib/database.types'

/**
 * transactions_search returns flat rows that each carry the SAME whole-match-set
 * totals (window aggregates). toSearchPage is the pure seam that (a) nests the
 * flat category_* columns back into HistoryRow.category so HistoryPage renders
 * unchanged, and (b) reads the totals off the first row — or zero when nothing
 * matched. These cases pin that contract without touching the network.
 */

// The generator declares every return column non-null; the LEFT-JOINed category
// columns are the ones that are really nullable. Build fixtures from the generated
// row (not a hand-written shape) with category_name widened to nullable, so the
// no-category case is expressible without a cast (convention 11).
type RawRow = Database['public']['Functions']['transactions_search']['Returns'][number]
type Raw = Omit<RawRow, 'category_name'> & { category_name: string | null }

/** A fully-populated expense row; override per case. match_* default to a
 *  single-row set so cases that don't care about totals stay readable. */
function row(over: Partial<Raw> = {}): Raw {
  return {
    id: 'tx-1',
    type: 'expense',
    amount: 120,
    date: '2026-07-30',
    note: 'กาแฟ',
    created_at: '2026-07-30T09:00:00Z',
    is_stock_purchase: false,
    is_stock_cogs: false,
    is_debt_settlement: false,
    stock_item_id: 'stock-1',
    category_name: 'อาหาร',
    category_icon: 'coffee',
    category_color_index: 2,
    match_count: 1,
    match_income: 0,
    match_expense: 120,
    ...over,
  }
}

describe('toSearchPage', () => {
  it('empty result → no rows and zero totals', () => {
    const page = toSearchPage([])
    expect(page.rows).toEqual([])
    expect(page.totals).toEqual({ count: 0, income: 0, expense: 0 })
    // and specifically the shared zero constant
    expect(page.totals).toEqual(EMPTY_TOTALS)
  })

  it('a row with a category → nested category object + every field forwarded', () => {
    const [r] = toSearchPage([
      row({
        id: 'tx-9',
        type: 'expense',
        amount: 500,
        date: '2026-07-28',
        note: 'เสื้อเข้าร้าน',
        created_at: '2026-07-28T02:30:00Z',
        is_stock_purchase: true,
        is_stock_cogs: false,
        is_debt_settlement: false,
        stock_item_id: 'stock-42',
        category_name: 'เสื้อเข้าร้าน',
        category_icon: 'shirt',
        category_color_index: 3,
      }),
    ]).rows

    const expected: HistoryRow = {
      id: 'tx-9',
      type: 'expense',
      amount: 500,
      date: '2026-07-28',
      note: 'เสื้อเข้าร้าน',
      created_at: '2026-07-28T02:30:00Z',
      is_stock_purchase: true,
      is_stock_cogs: false,
      is_debt_settlement: false,
      stock_item_id: 'stock-42',
      category: { name: 'เสื้อเข้าร้าน', icon: 'shirt', color_index: 3 },
    }
    expect(r).toEqual(expected)
  })

  it('a row whose category_name is null → category is null, not an empty-name object', () => {
    const [r] = toSearchPage([
      // icon / color are irrelevant here — a categoryless row ignores them
      row({ category_name: null, category_icon: 'tag', category_color_index: 1 }),
    ]).rows
    expect(r.category).toBeNull()
  })

  it('totals are the WHOLE match set, not the page: two rows tagged match_count 7 → count 7', () => {
    const page = toSearchPage([
      row({ id: 'a', type: 'expense', amount: 120, match_count: 7, match_income: 40, match_expense: 260 }),
      row({ id: 'b', type: 'income', amount: 40, match_count: 7, match_income: 40, match_expense: 260 }),
    ])
    expect(page.rows).toHaveLength(2)
    expect(page.totals).toEqual({ count: 7, income: 40, expense: 260 })
  })
})
