import { describe, it, expect } from 'vitest'
import {
  ageTier,
  computeCounts,
  computeSunkCost,
  selectStockItems,
  emptyMessage,
  AGE_FRESH_MAX,
  AGE_OLD_MAX,
  type StockFilter,
} from '@/pages/StockPage'
import type { StockItem } from '@/lib/db'

// Fixed "now" so every age below is deterministic (Asia/Bangkok calendar).
const NOW = new Date('2026-07-29T12:00:00+07:00')

/** Minimal StockItem factory — every field filled, override what a test needs. */
function item(over: Partial<StockItem> = {}): StockItem {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    user_id: 'u1',
    name: 'เสื้อยืด',
    brand: null,
    category: null,
    color: null,
    condition: null,
    cost_per_unit: 100,
    size: null,
    qty_total: 1,
    qty_remaining: 1,
    status: 'in_stock',
    needs_details: false,
    sku: 'SKU-0001',
    photos: [],
    source_transaction_id: null,
    created_at: '2026-07-20T05:00:00+07:00', // ~9 days → fresh
    updated_at: '2026-07-20T05:00:00+07:00',
    ...over,
  }
}

describe('ageTier — 30/60 day thresholds from a single source', () => {
  it('buckets by the fresh/old caps', () => {
    expect(ageTier(0)).toBe('fresh')
    expect(ageTier(AGE_FRESH_MAX)).toBe('fresh') // 30 = still fresh
    expect(ageTier(AGE_FRESH_MAX + 1)).toBe('aging') // 31 = aging
    expect(ageTier(AGE_OLD_MAX)).toBe('aging') // 60 = still aging
    expect(ageTier(AGE_OLD_MAX + 1)).toBe('old') // 61 = old
  })
})

// A representative mixed inventory reused across the count/filter cases.
const MIXED: StockItem[] = [
  item({ id: 'fresh', created_at: '2026-07-20T05:00:00+07:00' }), // ~9d, in stock
  item({ id: 'aging', created_at: '2026-06-20T05:00:00+07:00' }), // ~39d, aging
  item({ id: 'old1', created_at: '2026-05-01T05:00:00+07:00' }), // ~89d, stale
  item({ id: 'old2', created_at: '2026-04-15T05:00:00+07:00', needs_details: true }), // ~105d, stale + queue
  item({ id: 'sold', status: 'sold', created_at: '2026-03-01T05:00:00+07:00' }), // sold
  item({ id: 'queue', needs_details: true }), // fresh, in stock, queue
]

describe('computeCounts — per-chip badges over ALL items', () => {
  it('counts each chip independently of the active filter', () => {
    const c = computeCounts(MIXED, NOW)
    expect(c.all).toBe(6)
    expect(c.in_stock).toBe(5) // everything except the one sold
    expect(c.stale).toBe(2) // old1 + old2 (in stock, > 60 days)
    expect(c.needs_details).toBe(2) // old2 + queue
    expect(c.sold).toBe(1)
  })

  it('empty warehouse → every count is 0', () => {
    expect(computeCounts([], NOW)).toEqual({
      all: 0,
      in_stock: 0,
      stale: 0,
      needs_details: 0,
      sold: 0,
    })
  })

  it('everything sold → in_stock and stale are 0, sold holds the total', () => {
    const soldOut = [
      item({ id: 'a', status: 'sold' }),
      item({ id: 'b', status: 'sold' }),
    ]
    const c = computeCounts(soldOut, NOW)
    expect(c.all).toBe(2)
    expect(c.sold).toBe(2)
    expect(c.in_stock).toBe(0)
    expect(c.stale).toBe(0)
  })
})

describe('selectStockItems — filter + search + ordering', () => {
  it('"ในสต็อก" hides sold items', () => {
    const ids = selectStockItems(MIXED, 'in_stock', '', NOW).map((i) => i.id)
    expect(ids).not.toContain('sold')
    expect(ids).toHaveLength(5)
  })

  it('"ค้างนาน" keeps only in-stock items older than 60 days, oldest first', () => {
    const ids = selectStockItems(MIXED, 'stale', '', NOW).map((i) => i.id)
    expect(ids).toEqual(['old2', 'old1']) // 105d before 89d
  })

  it('"รอเติมข้อมูล" keeps only needs_details items', () => {
    const ids = selectStockItems(MIXED, 'needs_details', '', NOW).map((i) => i.id).sort()
    expect(ids).toEqual(['old2', 'queue'])
  })

  it('"ขายแล้ว" keeps only sold items', () => {
    const ids = selectStockItems(MIXED, 'sold', '', NOW).map((i) => i.id)
    expect(ids).toEqual(['sold'])
  })

  it('non-stale filters keep the incoming (newest-first) order', () => {
    const ids = selectStockItems(MIXED, 'all', '', NOW).map((i) => i.id)
    expect(ids).toEqual(['fresh', 'aging', 'old1', 'old2', 'sold', 'queue'])
  })

  it('search matches SKU case-insensitively', () => {
    const items = [
      item({ id: 'hit', sku: 'ABC-123' }),
      item({ id: 'miss', sku: 'XYZ-999', name: 'อื่น' }),
    ]
    const ids = selectStockItems(items, 'all', 'abc', NOW).map((i) => i.id)
    expect(ids).toEqual(['hit'])
  })

  it('search across brand / size / colour', () => {
    const items = [item({ id: 'nike', brand: 'Nike', name: 'รองเท้า' })]
    expect(selectStockItems(items, 'all', 'nike', NOW).map((i) => i.id)).toEqual(['nike'])
  })

  it('a search with no match returns nothing', () => {
    expect(selectStockItems(MIXED, 'all', 'ไม่มีทางเจอคำนี้', NOW)).toEqual([])
  })

  it('empty warehouse returns nothing for any filter', () => {
    const filters: StockFilter[] = ['all', 'in_stock', 'stale', 'needs_details', 'sold']
    for (const f of filters) expect(selectStockItems([], f, '', NOW)).toEqual([])
  })
})

describe('emptyMessage — reason-specific empty copy', () => {
  it('loading first', () => {
    expect(emptyMessage({ isLoading: true, total: 5, query: '', filter: 'all' })).toBe('กำลังโหลด…')
  })

  it('a missed search names the term and points at SKU', () => {
    const msg = emptyMessage({ isLoading: false, total: 5, query: 'hoodie', filter: 'all' })
    expect(msg).toContain('hoodie')
    expect(msg).toContain('SKU')
  })

  it('an empty warehouse points at intake', () => {
    const msg = emptyMessage({ isLoading: false, total: 0, query: '', filter: 'all' })
    expect(msg).toContain('รับเข้าสต็อก')
  })

  it('sold-out under the in-stock filter has its own line', () => {
    const msg = emptyMessage({ isLoading: false, total: 3, query: '', filter: 'in_stock' })
    expect(msg).toContain('ขายหมด')
  })
})

describe('computeSunkCost — cost stuck in stock older than the "ค้างนาน" cap', () => {
  // 2026-05-30 → exactly 60 days before NOW (not stale); 2026-05-29 → 61 (stale).
  const AT_60_DAYS = '2026-05-30T05:00:00+07:00'
  const AT_61_DAYS = '2026-05-29T05:00:00+07:00'

  it('sums cost × qty_remaining over every stale (in-stock, >60d) item', () => {
    const items = [
      item({ id: 'old1', cost_per_unit: 50, qty_remaining: 4, created_at: '2026-05-01T05:00:00+07:00' }), // ~89d
      item({ id: 'old2', cost_per_unit: 200, qty_remaining: 3, created_at: '2026-04-15T05:00:00+07:00' }), // ~105d
      item({ id: 'fresh', cost_per_unit: 999, qty_remaining: 9, created_at: '2026-07-20T05:00:00+07:00' }), // ~9d
    ]
    expect(computeSunkCost(items, NOW)).toBe(50 * 4 + 200 * 3) // 200 + 600 = 800; fresh excluded
  })

  it('never counts sold-out items, even when old', () => {
    const items = [
      item({ id: 'sold-old', cost_per_unit: 300, qty_remaining: 0, status: 'sold', created_at: '2026-03-01T05:00:00+07:00' }),
    ]
    expect(computeSunkCost(items, NOW)).toBe(0)
  })

  it('returns 0 when nothing is stale (the UI shows text, not ฿0)', () => {
    const items = [item({ id: 'fresh', created_at: '2026-07-20T05:00:00+07:00' })]
    expect(computeSunkCost(items, NOW)).toBe(0)
    expect(computeSunkCost([], NOW)).toBe(0)
  })

  it('draws the 60/61-day boundary exactly where the "ค้างนาน" chip does', () => {
    const at60 = item({ id: 'at60', cost_per_unit: 100, qty_remaining: 1, created_at: AT_60_DAYS })
    const at61 = item({ id: 'at61', cost_per_unit: 100, qty_remaining: 1, created_at: AT_61_DAYS })

    // 60 days exactly: not on the stale chip → contributes nothing to sunk cost.
    expect(selectStockItems([at60], 'stale', '', NOW)).toEqual([])
    expect(computeSunkCost([at60], NOW)).toBe(0)

    // 61 days: on the stale chip → its full cost is sunk.
    expect(selectStockItems([at61], 'stale', '', NOW).map((i) => i.id)).toEqual(['at61'])
    expect(computeSunkCost([at61], NOW)).toBe(100)
  })
})
