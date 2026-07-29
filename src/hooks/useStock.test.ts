import { describe, it, expect } from 'vitest'
import { computeStockHero } from '@/hooks/useStock'
import type { StockItem } from '@/lib/db'

/** A fully-typed StockItem with sensible defaults; override just what a case needs. */
function stockItem(over: Partial<StockItem>): StockItem {
  return {
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    id: 'item-1',
    user_id: 'user-1',
    name: 'เสื้อ',
    category: null,
    brand: null,
    size: null,
    color: null,
    condition: null,
    cost_per_unit: 100,
    qty_total: 1,
    qty_remaining: 1,
    target_price: null,
    sku: 'STZ-TST-0001',
    status: 'in_stock',
    needs_details: false,
    photos: [],
    source_transaction_id: null,
    ...over,
  }
}

describe('computeStockHero — inventory value & pending profit track qty_remaining', () => {
  it('values remaining units at cost, and pending profit at (target − cost) × remaining', () => {
    const hero = computeStockHero([
      stockItem({ cost_per_unit: 100, target_price: 150, qty_remaining: 3, status: 'in_stock' }),
    ])
    expect(hero.costValue).toBe(300) // 100 × 3
    expect(hero.pendingProfit).toBe(150) // (150 − 100) × 3
  })

  it('shrinks with qty_remaining as units sell off (partial)', () => {
    const hero = computeStockHero([
      stockItem({ cost_per_unit: 100, target_price: 150, qty_remaining: 1, status: 'partial' }),
    ])
    expect(hero.costValue).toBe(100) // 100 × 1
    expect(hero.pendingProfit).toBe(50) // (150 − 100) × 1
  })

  it('counts cost but zero pending profit when no target price is set', () => {
    const hero = computeStockHero([
      stockItem({ cost_per_unit: 100, target_price: null, qty_remaining: 2 }),
    ])
    expect(hero.costValue).toBe(200)
    expect(hero.pendingProfit).toBe(0)
  })
})

describe('computeStockHero — sold items drop out of the hero', () => {
  it('contributes nothing once status = sold', () => {
    const hero = computeStockHero([
      // A defensive case: even if qty_remaining were non-zero, sold is skipped.
      stockItem({ cost_per_unit: 100, target_price: 150, qty_remaining: 2, status: 'sold' }),
    ])
    expect(hero.costValue).toBe(0)
    expect(hero.pendingProfit).toBe(0)
  })

  it('sums only the still-in-stock items in a mixed list', () => {
    const hero = computeStockHero([
      stockItem({ id: 'a', cost_per_unit: 50, target_price: 80, qty_remaining: 4, status: 'in_stock' }),
      stockItem({ id: 'b', cost_per_unit: 200, target_price: 300, qty_remaining: 1, status: 'partial' }),
      stockItem({ id: 'c', cost_per_unit: 999, target_price: 1500, qty_remaining: 0, status: 'sold' }),
    ])
    expect(hero.costValue).toBe(50 * 4 + 200 * 1) // 400 — 'c' excluded
    expect(hero.pendingProfit).toBe((80 - 50) * 4 + (300 - 200) * 1) // 120 + 100 = 220
  })
})
