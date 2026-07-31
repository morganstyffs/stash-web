import { describe, expect, it } from 'vitest'
import {
  preferredWalletFor,
  topCategories,
  typicalAmountFor,
  unusualAmountBaseline,
  type HintRowLike,
} from '@/lib/entryHints'

// A terse row builder so each test reads as data, not boilerplate. `amount`
// defaults to 0 — the wallet/category tests don't read it, only the
// typical/unusual-amount tests below do.
function row(
  type: HintRowLike['type'],
  category_id: string | null,
  wallet_id: string | null,
  date: string,
  amount = 0,
): HintRowLike {
  return { type, category_id, wallet_id, date, amount }
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

describe('typicalAmountFor — the median past amount of a category', () => {
  it('returns the median of the amounts (odd count)', () => {
    const rows = [
      row('expense', 'food', 'cash', '2026-07-01', 100),
      row('expense', 'food', 'cash', '2026-07-02', 200),
      row('expense', 'food', 'cash', '2026-07-03', 300),
      row('expense', 'food', 'cash', '2026-07-04', 400),
      row('expense', 'food', 'cash', '2026-07-05', 500),
    ]
    expect(typicalAmountFor(rows, 'food', 'expense')).toBe(300)
  })

  it('returns null below the minimum sample count (4 rows)', () => {
    const rows = [
      row('expense', 'food', 'cash', '2026-07-01', 100),
      row('expense', 'food', 'cash', '2026-07-02', 200),
      row('expense', 'food', 'cash', '2026-07-03', 300),
      row('expense', 'food', 'cash', '2026-07-04', 400),
    ]
    expect(typicalAmountFor(rows, 'food', 'expense')).toBeNull()
  })

  it('an even sample count takes the average of the two middle values', () => {
    // 6 rows 100..600 → the two middle are 300 and 400 → (300+400)/2 = 350.
    const rows = [
      row('expense', 'food', 'cash', '2026-07-01', 100),
      row('expense', 'food', 'cash', '2026-07-02', 200),
      row('expense', 'food', 'cash', '2026-07-03', 300),
      row('expense', 'food', 'cash', '2026-07-04', 400),
      row('expense', 'food', 'cash', '2026-07-05', 500),
      row('expense', 'food', 'cash', '2026-07-06', 600),
    ]
    expect(typicalAmountFor(rows, 'food', 'expense')).toBe(350)
  })

  it('filters by type — income amounts never mix into the expense median', () => {
    // 5 expense rows (median 300) plus income rows on the same category with wild
    // amounts that would move the median if they leaked in.
    const rows = [
      row('expense', 'food', 'cash', '2026-07-01', 100),
      row('expense', 'food', 'cash', '2026-07-02', 200),
      row('expense', 'food', 'cash', '2026-07-03', 300),
      row('expense', 'food', 'cash', '2026-07-04', 400),
      row('expense', 'food', 'cash', '2026-07-05', 500),
      row('income', 'food', 'cash', '2026-07-06', 99_999),
      row('income', 'food', 'cash', '2026-07-07', 88_888),
    ]
    expect(typicalAmountFor(rows, 'food', 'expense')).toBe(300)
  })

  it('is order-independent — shuffling the input yields the same median', () => {
    const rows = [
      row('expense', 'food', 'cash', '2026-07-03', 300),
      row('expense', 'food', 'cash', '2026-07-01', 100),
      row('expense', 'food', 'cash', '2026-07-05', 500),
      row('expense', 'food', 'cash', '2026-07-02', 200),
      row('expense', 'food', 'cash', '2026-07-04', 400),
    ]
    const forward = typicalAmountFor(rows, 'food', 'expense')
    const reversed = typicalAmountFor([...rows].reverse(), 'food', 'expense')
    expect(forward).toBe(300)
    expect(reversed).toBe(forward)
  })
})

describe('unusualAmountBaseline — flags an amount that dwarfs the category norm', () => {
  // A category whose typical (median) amount is 300.
  const history: HintRowLike[] = [
    row('expense', 'food', 'cash', '2026-07-01', 100),
    row('expense', 'food', 'cash', '2026-07-02', 200),
    row('expense', 'food', 'cash', '2026-07-03', 300),
    row('expense', 'food', 'cash', '2026-07-04', 400),
    row('expense', 'food', 'cash', '2026-07-05', 500),
  ]

  it('warns at exactly the 10× threshold, returning the baseline it compared to', () => {
    // median 300 → threshold 3,000. 3,000 is unusual → warn, baseline 300.
    expect(unusualAmountBaseline(history, 'food', 'expense', 3_000)).toBe(300)
  })

  it('does NOT warn just below the threshold', () => {
    // 2,999 < 3,000 → no warning.
    expect(unusualAmountBaseline(history, 'food', 'expense', 2_999)).toBeNull()
  })

  it('returns null when no category is chosen yet', () => {
    expect(unusualAmountBaseline(history, null, 'expense', 99_999)).toBeNull()
  })

  it('returns null for a non-positive amount (empty / cleared field)', () => {
    expect(unusualAmountBaseline(history, 'food', 'expense', 0)).toBeNull()
  })

  it('returns null when the category has too little history, however high the amount', () => {
    const thin = [
      row('expense', 'bills', 'bank', '2026-07-01', 50),
      row('expense', 'bills', 'bank', '2026-07-02', 50),
    ]
    expect(unusualAmountBaseline(thin, 'bills', 'expense', 1_000_000)).toBeNull()
  })
})
