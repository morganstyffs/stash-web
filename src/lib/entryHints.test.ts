import { describe, expect, it } from 'vitest'
import { preferredWalletFor, topCategories, type HintRowLike } from '@/lib/entryHints'

// A terse row builder so each test reads as data, not boilerplate.
function row(
  type: HintRowLike['type'],
  category_id: string | null,
  wallet_id: string | null,
  date: string,
): HintRowLike {
  return { type, category_id, wallet_id, date }
}

describe('preferredWalletFor — the wallet most used with a category', () => {
  it('returns the wallet used most often for that category', () => {
    const rows = [
      row('expense', 'food', 'cash', '2026-07-01'),
      row('expense', 'food', 'cash', '2026-07-02'),
      row('expense', 'food', 'cash', '2026-07-03'),
      row('expense', 'food', 'bank', '2026-07-04'),
    ]
    expect(preferredWalletFor(rows, 'food')).toBe('cash')
  })

  it('returns null when the category has no history', () => {
    const rows = [row('expense', 'food', 'cash', '2026-07-01')]
    expect(preferredWalletFor(rows, 'bills')).toBeNull()
  })

  it('ignores rows with a null wallet — all-null history guesses nothing', () => {
    const rows = [
      row('expense', 'food', null, '2026-07-01'),
      row('expense', 'food', null, '2026-07-02'),
    ]
    expect(preferredWalletFor(rows, 'food')).toBeNull()
  })

  it('breaks a count tie by the more recent date', () => {
    const rows = [
      row('expense', 'food', 'cash', '2026-07-01'),
      row('expense', 'food', 'bank', '2026-07-09'),
    ]
    // one each → the wallet used more recently (bank) wins
    expect(preferredWalletFor(rows, 'food')).toBe('bank')
  })

  it('is order-independent — shuffling the input yields the same guess', () => {
    const rows = [
      row('expense', 'food', 'cash', '2026-07-01'),
      row('expense', 'food', 'cash', '2026-07-02'),
      row('expense', 'food', 'bank', '2026-07-05'),
      row('expense', 'food', 'bank', '2026-07-06'),
      row('expense', 'food', 'cash', '2026-07-07'),
    ]
    const forward = preferredWalletFor(rows, 'food')
    const reversed = preferredWalletFor([...rows].reverse(), 'food')
    expect(forward).toBe('cash') // cash 3 vs bank 2
    expect(reversed).toBe(forward)
  })
})

describe('topCategories — most-used categories of a type', () => {
  it('ranks most-used first and caps at the limit', () => {
    const rows = [
      row('expense', 'food', 'cash', '2026-07-01'),
      row('expense', 'food', 'cash', '2026-07-02'),
      row('expense', 'food', 'cash', '2026-07-03'),
      row('expense', 'bills', 'bank', '2026-07-01'),
      row('expense', 'bills', 'bank', '2026-07-02'),
      row('expense', 'fun', 'cash', '2026-07-01'),
    ]
    expect(topCategories(rows, 'expense', 2)).toEqual(['food', 'bills'])
  })

  it('filters by type — income rows never appear among expense results', () => {
    const rows = [
      row('income', 'salary', 'bank', '2026-07-01'),
      row('income', 'salary', 'bank', '2026-07-02'),
      row('expense', 'food', 'cash', '2026-07-01'),
    ]
    expect(topCategories(rows, 'expense', 4)).toEqual(['food'])
  })

  it('ignores rows with a null category', () => {
    const rows = [
      row('expense', null, 'cash', '2026-07-01'),
      row('expense', null, 'cash', '2026-07-02'),
      row('expense', 'food', 'cash', '2026-07-03'),
    ]
    expect(topCategories(rows, 'expense', 4)).toEqual(['food'])
  })

  it('returns [] for empty input', () => {
    expect(topCategories([], 'expense', 4)).toEqual([])
  })

  it('is order-independent — shuffling the input yields the same ranking', () => {
    const rows = [
      row('expense', 'food', 'cash', '2026-07-01'),
      row('expense', 'food', 'cash', '2026-07-02'),
      row('expense', 'bills', 'bank', '2026-07-05'),
      row('expense', 'bills', 'bank', '2026-07-06'),
      row('expense', 'fun', 'cash', '2026-07-07'),
    ]
    // food & bills tie on count (2 each); bills is more recent → bills first
    const forward = topCategories(rows, 'expense', 4)
    const reversed = topCategories([...rows].reverse(), 'expense', 4)
    expect(forward).toEqual(['bills', 'food', 'fun'])
    expect(reversed).toEqual(forward)
  })
})
