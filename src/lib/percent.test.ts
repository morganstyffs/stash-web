import { describe, it, expect } from 'vitest'
import { largestRemainderPercents } from '@/lib/percent'

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

describe('largestRemainderPercents', () => {
  it('makes the donut legend add up to 100, not 99', () => {
    // 39,000 / 6,002 / 2,000 / 1,050 of 48,052 → independent rounding gives
    // 81 + 12 + 4 + 2 = 99; largest-remainder gives the leftover point to 6,002.
    const out = largestRemainderPercents([39_000, 6_002, 2_000, 1_050])
    expect(sum(out)).toBe(100)
    expect(out).toEqual([81, 13, 4, 2])
  })

  it('returns all zeros when the total is zero', () => {
    expect(largestRemainderPercents([0, 0, 0])).toEqual([0, 0, 0])
    expect(largestRemainderPercents([])).toEqual([])
  })

  it('gives a single positive row the whole 100', () => {
    expect(largestRemainderPercents([4_200])).toEqual([100])
  })

  it('does not award a leftover point to a zero-valued row', () => {
    // 1/1/1/0 → floors 33/33/33/0 = 99; the leftover point goes to a non-zero
    // row (fraction .33), never the zero row (fraction 0).
    const out = largestRemainderPercents([1, 1, 1, 0])
    expect(sum(out)).toBe(100)
    expect(out[3]).toBe(0)
  })

  it('always sums to 100 across assorted splits', () => {
    for (const vals of [[1, 1, 1], [10, 10, 10, 10, 10, 10, 10], [999, 1], [7, 11, 13, 17]]) {
      expect(sum(largestRemainderPercents(vals))).toBe(100)
    }
  })
})
