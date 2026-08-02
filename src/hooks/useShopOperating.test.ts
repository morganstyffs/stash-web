import { describe, it, expect } from 'vitest'
import { sumShopRows, type ShopRow } from '@/hooks/useShopOperating'

describe('sumShopRows — split shop-operating rows into income / expense', () => {
  it('sums each side independently', () => {
    const rows: ShopRow[] = [
      { type: 'expense', amount: 50 }, // ค่าส่งจ่าย
      { type: 'expense', amount: 30 }, // บรรจุภัณฑ์
      { type: 'income', amount: 40 }, // ค่าส่งที่เก็บจากลูกค้า
    ]
    expect(sumShopRows(rows)).toEqual({ income: 40, expense: 80 })
  })

  it('empty → zero both sides', () => {
    expect(sumShopRows([])).toEqual({ income: 0, expense: 0 })
  })

  it('coerces a NaN amount to 0 (no NaN leaking into a total)', () => {
    const rows: ShopRow[] = [{ type: 'expense', amount: NaN }]
    expect(sumShopRows(rows)).toEqual({ income: 0, expense: 0 })
  })
})
