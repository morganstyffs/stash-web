import { describe, it, expect } from 'vitest'
import {
  todayISO,
  monthBounds,
  dayOfMonthISO,
  currentMonthAnchor,
  toISODate,
} from '@/lib/dates'

// All instants below carry an explicit +07:00 offset, so these assertions hold
// no matter which timezone the CI runner is in. They pin that "today / this
// month" is reckoned in Asia/Bangkok — not the device — matching the DB (0010).

describe('todayISO — Asia/Bangkok calendar day', () => {
  it('00:30 Bangkok on the 1st is the 1st (a UTC device would still say July 31)', () => {
    // 2026-08-01T00:30+07:00 === 2026-07-31T17:30Z — device-local UTC would drift.
    expect(todayISO(new Date('2026-08-01T00:30:00+07:00'))).toBe('2026-08-01')
  })

  it('23:30 Bangkok on the last day is still that day (not tomorrow in UTC+)', () => {
    expect(todayISO(new Date('2026-07-31T23:30:00+07:00'))).toBe('2026-07-31')
  })
})

describe('monthBounds — window seeded from the Bangkok month', () => {
  it('00:30 ICT on Aug 1 yields the AUGUST window (not July)', () => {
    const b = monthBounds(new Date('2026-08-01T00:30:00+07:00'))
    expect(b.start).toBe('2026-08-01')
    expect(b.next).toBe('2026-09-01')
    expect(b.prevStart).toBe('2026-07-01')
    expect(b.days).toBe(31)
    expect(b.key).toBe('2026-08')
  })

  it('23:30 ICT on Jul 31 still yields the JULY window', () => {
    const b = monthBounds(new Date('2026-07-31T23:30:00+07:00'))
    expect(b.start).toBe('2026-07-01')
    expect(b.next).toBe('2026-08-01')
    expect(b.key).toBe('2026-07')
  })

  it('handles year rollover and leap February day counts', () => {
    const dec = monthBounds(new Date('2026-12-15T12:00:00+07:00'))
    expect(dec.next).toBe('2027-01-01') // rolls into next year
    const feb = monthBounds(new Date('2028-02-10T12:00:00+07:00'))
    expect(feb.days).toBe(29) // 2028 is a leap year
  })
})

describe('dayOfMonthISO / currentMonthAnchor / toISODate', () => {
  it('reads the day straight from the string (tz-proof)', () => {
    expect(dayOfMonthISO('2026-08-01')).toBe(1)
    expect(dayOfMonthISO('2026-08-31')).toBe(31)
  })

  it('currentMonthAnchor lands mid-month in the Bangkok month', () => {
    const anchor = currentMonthAnchor(new Date('2026-08-01T00:30:00+07:00'))
    expect(anchor.getMonth()).toBe(7) // August (0-indexed), mid-month, tz-safe
    expect(anchor.getDate()).toBe(15)
  })

  it('toISODate stringifies a local calendar date', () => {
    expect(toISODate(new Date(2026, 7, 9))).toBe('2026-08-09')
  })
})
