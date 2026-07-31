import { describe, it, expect } from 'vitest'
import {
  todayISO,
  monthBounds,
  monthBoundsFromKey,
  monthAnchorFromKey,
  addMonthsToKey,
  dayOfMonthISO,
  daysLeftInMonth,
  daysLeftInMonthKey,
  currentMonthAnchor,
  toISODate,
  formatRecentDayLabel,
  formatUpcomingDayLabel,
  daysSince,
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

describe('addMonthsToKey — pure integer month shift on a YYYY-MM key', () => {
  it('steps back over a year boundary and forward over one', () => {
    expect(addMonthsToKey('2026-01', -1)).toBe('2025-12')
    expect(addMonthsToKey('2026-12', 1)).toBe('2027-01')
  })

  it('shifts by more than a year in one call', () => {
    expect(addMonthsToKey('2026-07', -13)).toBe('2025-06')
  })

  it('is a no-op for delta 0', () => {
    expect(addMonthsToKey('2026-07', 0)).toBe('2026-07')
  })
})

describe('monthBoundsFromKey — window for an explicit YYYY-MM key', () => {
  it('counts leap February from the key alone (no instant needed)', () => {
    expect(monthBoundsFromKey('2028-02').days).toBe(29) // 2028 is a leap year
  })

  it('yields the previous/next month across a year boundary', () => {
    const b = monthBoundsFromKey('2026-01')
    expect(b.start).toBe('2026-01-01')
    expect(b.prevStart).toBe('2025-12-01')
    expect(b.next).toBe('2026-02-01')
    expect(b.key).toBe('2026-01')
  })

  it('matches monthBounds(now) for the current month', () => {
    const now = new Date('2026-07-15T12:00:00+07:00')
    expect(monthBoundsFromKey('2026-07')).toEqual(monthBounds(now))
  })
})

describe('monthAnchorFromKey — a mid-month Date for the key', () => {
  it('lands mid-month so it can never cross a boundary', () => {
    const anchor = monthAnchorFromKey('2026-08')
    expect(anchor.getFullYear()).toBe(2026)
    expect(anchor.getMonth()).toBe(7) // August (0-indexed)
    expect(anchor.getDate()).toBe(15)
  })
})

describe('daysLeftInMonthKey — days left keyed on which month, not just now', () => {
  it('is 0 for a past month even when today sits mid-month elsewhere', () => {
    // Viewing June while "now" is mid-July: the month is over, nothing left.
    expect(daysLeftInMonthKey('2026-06', new Date('2026-07-15T12:00:00+07:00'))).toBe(0)
  })

  it('is the whole month for a future key', () => {
    // UI blocks this, but the definition is explicit rather than ambiguous.
    expect(daysLeftInMonthKey('2026-09', new Date('2026-07-15T12:00:00+07:00'))).toBe(30)
  })

  it('equals daysLeftInMonth(now) exactly for the current month', () => {
    const now = new Date('2026-07-29T12:00:00+07:00')
    expect(daysLeftInMonthKey(monthBounds(now).key, now)).toBe(daysLeftInMonth(now))
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

describe('daysSince — age in Bangkok calendar days', () => {
  it('is 0 for two instants on the same Bangkok day', () => {
    const now = new Date('2026-07-29T20:00:00+07:00')
    expect(daysSince('2026-07-29T05:00:00+07:00', now)).toBe(0)
  })

  it('counts whole days across a month boundary', () => {
    const now = new Date('2026-07-02T12:00:00+07:00')
    expect(daysSince('2026-06-30T12:00:00+07:00', now)).toBe(2)
  })

  it('ages by the BANGKOK day, not the UTC day, when the timestamp falls at night in UTC', () => {
    // 2026-07-28T18:00Z === 2026-07-29T01:00 ICT → recorded on the 29th in Bangkok.
    // Comparing UTC calendar dates would wrongly say 1 day; the Bangkok day is the same.
    const now = new Date('2026-07-29T10:00:00+07:00')
    expect(daysSince('2026-07-28T18:00:00Z', now)).toBe(0)
  })

  it('clamps a future timestamp to 0', () => {
    const now = new Date('2026-07-29T10:00:00+07:00')
    expect(daysSince('2026-08-05T10:00:00+07:00', now)).toBe(0)
  })

  it('counts a full year (365 days) without drifting', () => {
    const now = new Date('2026-07-29T09:00:00+07:00')
    expect(daysSince('2025-07-29T09:00:00+07:00', now)).toBe(365)
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

describe('formatUpcomingDayLabel — forward-looking labels for รอจ่าย', () => {
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

  it('prefixes today with วันนี้', () => {
    expect(formatUpcomingDayLabel('2026-07-29', now)).toBe(`วันนี้ · ${fmt('2026-07-29')}`)
  })

  it('prefixes tomorrow with พรุ่งนี้ (forward, not เมื่อวาน)', () => {
    expect(formatUpcomingDayLabel('2026-07-30', now)).toBe(`พรุ่งนี้ · ${fmt('2026-07-30')}`)
  })

  it('shows a bare day/month for later same-year dates', () => {
    expect(formatUpcomingDayLabel('2026-08-05', now)).toBe(fmt('2026-08-05'))
  })

  it('appends the Buddhist-era year for a different year', () => {
    const label = formatUpcomingDayLabel('2027-01-09', now)
    expect(label).toBe(fmt('2027-01-09', true))
    expect(label).toContain('2570') // 2027 CE === 2570 BE
  })

  it('reckons tomorrow across a month boundary in the Bangkok calendar', () => {
    const jul31 = new Date('2026-07-31T23:30:00+07:00') // today = 2026-07-31 (Bangkok)
    expect(formatUpcomingDayLabel('2026-08-01', jul31).startsWith('พรุ่งนี้')).toBe(true)
  })
})
