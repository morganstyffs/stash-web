import { describe, it, expect } from 'vitest'
import {
  donutCenterFontSize,
  DONUT_CENTER_FONT_MAX,
  DONUT_CENTER_FONT_MIN,
} from '@/components/charts'
import { formatBaht, MASKED_BAHT } from '@/lib/format'

// The donut centre total overflowed the ring at a fixed 13px. donutCenterFontSize
// shrinks by the display string's length. These lock the three cases the spec
// calls out (verification must prove it WORKS, not just exists).

describe('donutCenterFontSize', () => {
  it('keeps the max size for a short total (฿0)', () => {
    expect(formatBaht(0)).toBe('฿0') // 2 chars
    expect(donutCenterFontSize('฿0'.length)).toBe(13)
  })

  it('shrinks the reference total (฿48,052) to fit the hole', () => {
    expect(formatBaht(48_052)).toBe('฿48,052') // 7 chars
    // ~50px at 13px vs a ~43.8px chord → floors to 11px (fits)
    expect(donutCenterFontSize('฿48,052'.length)).toBe(11)
  })

  it('clamps a 7-figure total (฿1,234,567) to the 11px floor', () => {
    expect(formatBaht(1_234_567)).toBe('฿1,234,567') // 10 chars
    // geometry wants ~8px here — below the readability floor, so it clamps to 11
    // and still overflows: the signal to move the number out of the ring.
    expect(donutCenterFontSize('฿1,234,567'.length)).toBe(11)
  })

  it('shows the hide-balance mask at full size', () => {
    expect(donutCenterFontSize(MASKED_BAHT.length)).toBe(13)
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
