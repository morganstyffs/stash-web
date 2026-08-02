import { describe, it, expect } from 'vitest'
import { overBudgetNote, paceNote, remainingNote, UNUSED_NOTE } from '@/lib/budgetNote'
import { formatBaht, MASKED_BAHT } from '@/lib/format'

/**
 * The per-category secondary line: a decision NUMBER, with a warning only when
 * there is something to warn about. The four rows below are exactly the ใบ 5
 * spec table. `money` is injected so the same builder masks under hideBalance.
 */

const money = (v: number) => formatBaht(v) // visible (hideBalance off)
const masked = (_v: number) => MASKED_BAHT // hideBalance on

describe('paceNote — the four states (hideBalance off)', () => {
  it('normal → "เหลือ ฿9,500"', () => {
    expect(paceNote('on_track', { remaining: 9_500, over: 0 }, money)).toBe('เหลือ ฿9,500')
  })

  it('nothing spent yet → "ยังไม่ได้ใช้" (no figure, no warning)', () => {
    expect(paceNote('unused', { remaining: 10_000, over: 0 }, money)).toBe('ยังไม่ได้ใช้')
  })

  it('used faster than pace → "เหลือ ฿2,000 · ใช้เร็วกว่าจังหวะ" (number first, warning second)', () => {
    expect(paceNote('fast', { remaining: 2_000, over: 0 }, money)).toBe(
      'เหลือ ฿2,000 · ใช้เร็วกว่าจังหวะ',
    )
  })

  it('over budget → "เกินงบ ฿1,200" (the real overshoot, never clamped)', () => {
    expect(paceNote('over', { remaining: -1_200, over: 1_200 }, money)).toBe('เกินงบ ฿1,200')
  })
})

describe('paceNote — hideBalance masks the baht in every money state', () => {
  it('on_track masks the remaining figure', () => {
    expect(paceNote('on_track', { remaining: 9_500, over: 0 }, masked)).toBe(`เหลือ ${MASKED_BAHT}`)
  })

  it('fast masks the remaining figure but keeps the pace warning', () => {
    expect(paceNote('fast', { remaining: 2_000, over: 0 }, masked)).toBe(
      `เหลือ ${MASKED_BAHT} · ใช้เร็วกว่าจังหวะ`,
    )
  })

  it('over masks the overshoot figure', () => {
    expect(paceNote('over', { remaining: -1_200, over: 1_200 }, masked)).toBe(
      `เกินงบ ${MASKED_BAHT}`,
    )
  })

  it('unused has no figure, so it reads the same masked or not', () => {
    expect(paceNote('unused', { remaining: 10_000, over: 0 }, masked)).toBe(UNUSED_NOTE)
  })
})

describe('shared atoms — the "เกินงบ ฿X" wording is one string', () => {
  it('overBudgetNote matches what the hero chip renders', () => {
    // WovenHero.overBudgetChip delegates here, so both surfaces phrase it once.
    expect(overBudgetNote(2_500, formatBaht)).toBe(`เกินงบ ${formatBaht(2_500)}`)
  })

  it('remainingNote is the plain "เหลือ ฿X"', () => {
    expect(remainingNote(500, formatBaht)).toBe(`เหลือ ${formatBaht(500)}`)
  })
})
