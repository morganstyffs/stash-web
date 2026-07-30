import { describe, it, expect } from 'vitest'
import {
  donutCenterFontSize,
  DONUT_CENTER_FONT_MAX,
  DONUT_CENTER_FONT_MIN,
} from '@/components/charts'
import { formatBaht, MASKED_BAHT } from '@/lib/format'

// donutCenterFontSize picks the largest size whose text box fits the ring hole.
// After widening the hole (stroke 9, render 90px, single line), realistic totals
// no longer get squeezed to the floor. These lock the four cases the spec calls
// out; the real-browser fit is verified in charts.visual.test.ts.

describe('donutCenterFontSize', () => {
  it('keeps the max size for a short total (฿0)', () => {
    expect(formatBaht(0)).toBe('฿0') // 2 chars
    expect(donutCenterFontSize('฿0'.length)).toBeGreaterThanOrEqual(13)
  })

  it('keeps the everyday total (฿48,052) at full size — no more squeeze', () => {
    expect(formatBaht(48_052)).toBe('฿48,052') // 7 chars
    expect(donutCenterFontSize('฿48,052'.length)).toBeGreaterThanOrEqual(13)
  })

  it('keeps a 6-figure total (฿999,999) legible (≥12px)', () => {
    expect(formatBaht(999_999)).toBe('฿999,999') // 8 chars
    expect(donutCenterFontSize('฿999,999'.length)).toBeGreaterThanOrEqual(12)
  })

  it('fits a 7-figure total (฿1,234,567) at ≥11px', () => {
    expect(formatBaht(1_234_567)).toBe('฿1,234,567') // 10 chars
    expect(donutCenterFontSize('฿1,234,567'.length)).toBeGreaterThanOrEqual(11)
  })

  it('shows the hide-balance mask at full size', () => {
    expect(donutCenterFontSize(MASKED_BAHT.length)).toBeGreaterThanOrEqual(13)
  })

  it('never leaves the [11,13] band and never grows with length', () => {
    let prev = Infinity
    for (let n = 1; n <= 20; n++) {
      const size = donutCenterFontSize(n)
      expect(size).toBeGreaterThanOrEqual(DONUT_CENTER_FONT_MIN)
      expect(size).toBeLessThanOrEqual(DONUT_CENTER_FONT_MAX)
      expect(size).toBeLessThanOrEqual(prev) // non-increasing
      prev = size
    }
  })
})
