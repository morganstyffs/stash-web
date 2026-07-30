import { describe, expect, it } from 'vitest'
import { computeSpendable } from '@/lib/spendable'

describe('computeSpendable — SAFE sub-line money decision', () => {
  it('no bills → plain average-per-day (unchanged original line)', () => {
    // 9,000 over 10 days = 900/day, nothing committed
    expect(computeSpendable(9_000, 0, 10)).toEqual({
      daysLeft: 10,
      bills: 0,
      over: 0,
      perDay: 900,
    })
  })

  it('with bills → spreads only what is left after the bills', () => {
    // the spec example: 26,948 − 19,000 = 7,948 over 2 days = 3,974/day
    expect(computeSpendable(26_948, 19_000, 2)).toEqual({
      daysLeft: 2,
      bills: 19_000,
      over: 0,
      perDay: 3_974,
    })
  })

  it('bills exceed what is left → over-committed, NOT a negative rate or a silent 0', () => {
    const v = computeSpendable(10_000, 15_000, 10)
    // the shortfall is reported as a positive "over" figure…
    expect(v.over).toBe(5_000)
    // …and there is deliberately no per-day rate (never negative, never clamped to 0)
    expect(v.perDay).toBeNull()
    expect(v).toEqual({ daysLeft: 10, bills: 15_000, over: 5_000, perDay: null })
  })

  it('daysLeft = 0 → no rate (no divide-by-zero), bills still shown', () => {
    // month over, a bill still pending but nothing to spread it over
    expect(computeSpendable(10_000, 4_000, 0)).toEqual({
      daysLeft: 0,
      bills: 4_000,
      over: 0,
      perDay: null,
    })
    // and over-committed at daysLeft 0 still reports the shortfall
    expect(computeSpendable(3_000, 4_000, 0)).toEqual({
      daysLeft: 0,
      bills: 4_000,
      over: 1_000,
      perDay: null,
    })
  })

  it('negative safe-to-spend with NO bills stays the quiet "N days left" (no over warning)', () => {
    // pre-existing behaviour: overspent, no recurring bills → no per-day, no over
    expect(computeSpendable(-1_500, 0, 10)).toEqual({
      daysLeft: 10,
      bills: 0,
      over: 0,
      perDay: null,
    })
  })

  it('bills exactly equal the balance → no rate, no over (all committed, honestly)', () => {
    expect(computeSpendable(5_000, 5_000, 8)).toEqual({
      daysLeft: 8,
      bills: 5_000,
      over: 0,
      perDay: null,
    })
  })
})
