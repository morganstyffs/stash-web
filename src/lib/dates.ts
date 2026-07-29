/**
 * Date helpers for the app's calendar. The whole app — and the database (0010:
 * `(now() at time zone 'Asia/Bangkok')::date`) — reckons "today" and "this
 * month" in **Asia/Bangkok**, NOT the device timezone. Every "what is today /
 * this month" question goes through here so a friend whose phone is set to a
 * different timezone still sees the same day/month the DB recorded (otherwise a
 * transaction at 00:30 ICT from a UTC device lands on the wrong day, and the
 * month totals/filters drift by a day at the boundary).
 */

const APP_TZ = 'Asia/Bangkok'

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Year / month(1–12) / day(1–31) of an instant, in Asia/Bangkok. */
function bangkokYMD(instant: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant)
  const val = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  return { y: val('year'), m: val('month'), d: val('day') }
}

/** Local YYYY-MM-DD for a Date (used to stringify an already-local calendar date). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * Today's date in Asia/Bangkok as YYYY-MM-DD — the canonical "today" for new
 * transactions/sales. Matches the DB's date default so the client and server
 * never disagree about which day it is.
 */
export function todayISO(now: Date = new Date()): string {
  const { y, m, d } = bangkokYMD(now)
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/**
 * Day-of-month (1–31) read verbatim from a YYYY-MM-DD string — the single,
 * timezone-proof way to get a day number from a stored date. Never route a
 * date-only string through `new Date(...).getDate()`: it parses as UTC midnight
 * and shifts in negative-offset timezones (see F-25/F-26).
 */
export function dayOfMonthISO(isoDate: string): number {
  return Number(isoDate.slice(8, 10))
}

/**
 * A Date positioned mid-month in the Bangkok calendar. Safe to hand to the
 * month-name formatters (which format in device-local time) — mid-month can't
 * cross a boundary, so the label is always the correct Bangkok month.
 */
export function currentMonthAnchor(now: Date = new Date()): Date {
  const { y, m } = bangkokYMD(now)
  return new Date(y, m - 1, 15)
}

export interface MonthBounds {
  /** first day of this month, inclusive */
  start: string
  /** first day of next month, exclusive */
  next: string
  /** first day of previous month, inclusive */
  prevStart: string
  /** number of days in this month */
  days: number
  /** stable key for query caching, e.g. "2026-07" */
  key: string
}

export function monthBounds(now: Date = new Date()): MonthBounds {
  // Seed from the Bangkok calendar; the rest is pure month arithmetic. Building
  // via new Date(y, m, …) then toISODate keeps both construction and read in the
  // same (device-local) frame, so they cancel and the strings are tz-stable —
  // only the seed year/month is timezone-sensitive, and that's now Bangkok.
  const { y, m: month1 } = bangkokYMD(now)
  const m = month1 - 1 // 0-indexed for Date()
  return {
    start: toISODate(new Date(y, m, 1)),
    next: toISODate(new Date(y, m + 1, 1)),
    prevStart: toISODate(new Date(y, m - 1, 1)),
    days: new Date(y, m + 1, 0).getDate(),
    key: `${y}-${pad2(month1)}`,
  }
}
