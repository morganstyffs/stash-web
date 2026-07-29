import { describe, it, expect } from 'vitest'
import {
  todayISO,
  monthBounds,
  dayOfMonthISO,
  daysLeftInMonth,
  currentMonthAnchor,
  toISODate,
  formatRecentDayLabel,
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

describe('daysLeftInMonth — days remaining including today (Bangkok)', () => {
  // July 2026 has 31 days. The count includes today, so the daily-allowance
  // figure doesn't jump the instant the clock rolls past midnight.
  it('the 1st of a 31-day month leaves the whole month', () => {
    expect(daysLeftInMonth(new Date('2026-07-01T12:00:00+07:00'))).toBe(31)
  })

  it('the 29th leaves 3 days (29th, 30th, 31st)', () => {
    expect(daysLeftInMonth(new Date('2026-07-29T12:00:00+07:00'))).toBe(3)
  })

  it('the last day leaves 1 (today itself)', () => {
    expect(daysLeftInMonth(new Date('2026-07-31T12:00:00+07:00'))).toBe(1)
  })

  it('reckons the day against the Bangkok calendar at the boundary', () => {
    // 00:30 ICT on Aug 1 is the 1st in Bangkok (a UTC device would say Jul 31).
    expect(daysLeftInMonth(new Date('2026-08-01T00:30:00+07:00'))).toBe(31)
  })
})

describe('formatRecentDayLabel — grouped ledger day labels', () => {
  // Format the expected day/month the same way the helper does (local build →
  // device-local Intl), so assertions hold regardless of the CI runner's ICU.
  const fmt = (iso: string, withYear = false) => {
    const y = Number(iso.slice(0, 4))
    const m = Number(iso.slice(5, 7))
    const d = Number(iso.slice(8, 10))
    return new Intl.DateTimeFormat('th-TH', {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' as const } : {}),
    }).format(new Date(y, m - 1, d))
  }

  const now = new Date('2026-07-29T10:00:00+07:00') // today = 2026-07-29 (Bangkok)

  it('prefixes today with วันนี้ and no year', () => {
    expect(formatRecentDayLabel('2026-07-29', now)).toBe(`วันนี้ · ${fmt('2026-07-29')}`)
  })

  it('prefixes yesterday with เมื่อวาน', () => {
    expect(formatRecentDayLabel('2026-07-28', now)).toBe(`เมื่อวาน · ${fmt('2026-07-28')}`)
  })

  it('shows a bare day/month for older same-year dates', () => {
    expect(formatRecentDayLabel('2026-07-20', now)).toBe(fmt('2026-07-20'))
  })

  it('appends the Buddhist-era year for a different year', () => {
    const label = formatRecentDayLabel('2025-01-09', now)
    expect(label).toBe(fmt('2025-01-09', true))
    expect(label).toContain('2568') // 2025 CE === 2568 BE
  })

  it('reckons today/yesterday against the Bangkok calendar at the day boundary', () => {
    const lateNight = new Date('2026-07-29T23:30:00+07:00') // still the 29th in Bangkok
    expect(formatRecentDayLabel('2026-07-29', lateNight).startsWith('วันนี้')).toBe(true)
    expect(formatRecentDayLabel('2026-07-28', lateNight).startsWith('เมื่อวาน')).toBe(true)
  })

  it('handles yesterday across a month boundary', () => {
    const aug1 = new Date('2026-08-01T00:30:00+07:00') // today = 2026-08-01 (Bangkok)
    expect(formatRecentDayLabel('2026-07-31', aug1).startsWith('เมื่อวาน')).toBe(true)
  })
})
