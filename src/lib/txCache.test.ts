import { describe, it, expect } from 'vitest'
import { insertMonth, insertRecent } from '@/lib/txCache'

// The row shapes here are the structural minimums the functions require — the
// same fields the real RecentRow / MonthRow carry, nothing the logic depends on
// is invented. All pure: no network, no mocking.

interface R {
  id: string
  date: string
  created_at: string
}
const r = (id: string, date: string, created_at: string): R => ({ id, date, created_at })

describe('insertRecent', () => {
  const base = [
    r('a', '2026-07-20', '2026-07-20T03:00:00+00:00'),
    r('b', '2026-07-15', '2026-07-15T03:00:00+00:00'),
    r('c', '2026-07-10', '2026-07-10T03:00:00+00:00'),
  ]

  it('puts a row newer than everything at the top', () => {
    const out = insertRecent(base, r('n', '2026-07-31', '2026-07-31T09:00:00+00:00'), 8)
    expect(out.map((x) => x.id)).toEqual(['n', 'a', 'b', 'c'])
  })

  it('sorts a backdated row into place by date, not to the top', () => {
    // the whole point of the ticket: a backdated entry must not jump to the top
    const out = insertRecent(base, r('n', '2026-07-12', '2026-07-31T09:00:00+00:00'), 8)
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'n', 'c'])
  })

  it('breaks a same-date tie by created_at, newest first', () => {
    const out = insertRecent(base, r('n', '2026-07-15', '2026-07-15T09:00:00+00:00'), 8)
    // n and b share 2026-07-15; n has the later created_at so it sits above b
    expect(out.map((x) => x.id)).toEqual(['a', 'n', 'b', 'c'])
  })

  it('stays at the limit and drops the oldest when already full', () => {
    const full = [
      r('a', '2026-07-20', '2026-07-20T00:00:00+00:00'),
      r('b', '2026-07-19', '2026-07-19T00:00:00+00:00'),
      r('c', '2026-07-18', '2026-07-18T00:00:00+00:00'),
    ]
    const out = insertRecent(full, r('n', '2026-07-31', '2026-07-31T00:00:00+00:00'), 3)
    expect(out).toHaveLength(3)
    expect(out.map((x) => x.id)).toEqual(['n', 'a', 'b'])
  })

  it('dedupes by id instead of growing the list', () => {
    const out = insertRecent(base, r('b', '2026-07-15', '2026-07-15T05:00:00+00:00'), 8)
    expect(out).toHaveLength(base.length)
    expect(out.filter((x) => x.id === 'b')).toHaveLength(1)
  })

  it('does not mutate the input array', () => {
    const input = [...base]
    insertRecent(input, r('n', '2026-07-31', '2026-07-31T00:00:00+00:00'), 8)
    expect(input).toEqual(base)
  })
})

describe('insertMonth', () => {
  const prev = [{ date: '2026-07-05' }, { date: '2026-06-20' }]

  it('appends a row whose date is inside the window', () => {
    const out = insertMonth(prev, { date: '2026-07-31' }, '2026-06-01', '2026-08-01')
    expect(out).toHaveLength(prev.length + 1)
    expect(out).toContainEqual({ date: '2026-07-31' })
  })

  it('returns the original array untouched when the date is out of window', () => {
    const out = insertMonth(prev, { date: '2026-05-31' }, '2026-06-01', '2026-08-01')
    expect(out).toBe(prev)
  })

  it('treats endExclusive as exclusive', () => {
    const out = insertMonth(prev, { date: '2026-08-01' }, '2026-06-01', '2026-08-01')
    expect(out).toBe(prev)
  })
})
