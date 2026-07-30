import { describe, it, expect } from 'vitest'
import { catColorVar } from '@/lib/catColor'

describe('catColorVar', () => {
  it('maps slots 1–6 to their palette variable', () => {
    for (let n = 1; n <= 6; n++) {
      expect(catColorVar(n)).toBe(`rgb(var(--color-cat-${n}))`)
    }
  })

  it('falls back to the neutral for null / uncategorised', () => {
    expect(catColorVar(null)).toBe('rgb(var(--color-cat-other))')
    expect(catColorVar(undefined)).toBe('rgb(var(--color-cat-other))')
  })

  it('falls back to the neutral for out-of-range or non-integer slots', () => {
    expect(catColorVar(0)).toBe('rgb(var(--color-cat-other))')
    expect(catColorVar(7)).toBe('rgb(var(--color-cat-other))')
    expect(catColorVar(-1)).toBe('rgb(var(--color-cat-other))')
    expect(catColorVar(2.5)).toBe('rgb(var(--color-cat-other))')
  })
})
