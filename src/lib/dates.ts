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
 * Current month as YYYY-MM in Asia/Bangkok — the key used to detect a new-month
 * rollover on the home screen. Same calendar as todayISO, so it flips exactly
 * when the DB's month does, not when the device's local month does.
 */
export function monthKey(now: Date = new Date()): string {
  const { y, m } = bangkokYMD(now)
  return `${y}-${pad2(m)}`
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

/**
 * 'YYYY-MM' shifted by `delta` months. Pure integer arithmetic on the year and
 * month parsed out of the string — never new Date(key), which would parse a
 * bare month as UTC and can drift (rule 17). `key` is the app-wide unit for "a
 * month": a string that slots straight into a queryKey / URL and compares with
 * < / > directly, no Date involved.
 */
export function addMonthsToKey(key: string, delta: number): string {
  const y = Number(key.slice(0, 4))
  const month1 = Number(key.slice(5, 7)) // 1–12
  const total = y * 12 + (month1 - 1) + delta // absolute month index, 0-based
  const ny = Math.floor(total / 12)
  const nm = total - ny * 12 + 1 // back to 1–12
  return `${ny}-${pad2(nm)}`
}

/**
 * A Date positioned mid-month for a 'YYYY-MM' key — the key's own equivalent of
 * currentMonthAnchor. Safe to hand to the device-local month-name formatters:
 * mid-month can't cross a boundary, so the built-and-read frame cancels and the
 * label is always the correct month.
 */
export function monthAnchorFromKey(key: string): Date {
  const y = Number(key.slice(0, 4))
  const month1 = Number(key.slice(5, 7)) // 1–12
  return new Date(y, month1 - 1, 15)
}

/**
 * The last `count` month keys ending at the current Bangkok month, newest first:
 * ['2026-07', '2026-06', … ]. Feeds the history page's month-filter sheet (a fixed
 * 12-month lookback). Every step goes through addMonthsToKey, so the year boundary
 * is handled in exactly one place (convention 10) — never re-derived by hand here.
 */
export function recentMonthKeys(now: Date = new Date(), count = 12): string[] {
  const current = monthKey(now)
  return Array.from({ length: count }, (_, i) => addMonthsToKey(current, -i))
}

/** A well-formed 'YYYY-MM' month key (month 01–12). The single source of the
 *  month-param shape — both parsers below test against it, never their own copy
 *  of the regex (convention 10). */
const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * Resolve the home screen's ?m=YYYY-MM query param to a safe month key. The raw
 * value is untrusted URL input, so anything that isn't a well-formed month at or
 * before the current month falls back to the current month — the app never shows
 * a future month. Pure (compares 'YYYY-MM' strings, never new Date(raw)) so it
 * can be unit-tested against the validation table.
 */
export function parseMonthParam(raw: string | null | undefined, now: Date = new Date()): string {
  const current = monthKey(now)
  if (!raw || !MONTH_KEY_RE.test(raw)) return current
  return raw > current ? current : raw
}

/**
 * Resolve an OPTIONAL month filter (the history page's ?m=YYYY-MM) to either a
 * safe month key or '' meaning "every month". Same validation as parseMonthParam
 * — same regex, same never-the-future rule — but a bad/missing/future value falls
 * back to '' (no filter) instead of the current month, because the history page
 * defaults to showing every month, not just this one. Pure (compares 'YYYY-MM'
 * strings, never new Date(raw)).
 */
export function parseOptionalMonthParam(
  raw: string | null | undefined,
  now: Date = new Date(),
): string {
  const current = monthKey(now)
  if (!raw || !MONTH_KEY_RE.test(raw)) return ''
  return raw > current ? '' : raw
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

/**
 * A Date at *device-local* midnight built from a YYYY-MM-DD string's numeric
 * parts — never `new Date(iso)`, which parses as UTC and shifts a day in
 * negative-offset zones (rule 18 / F-25). The Date is only ever handed to a
 * device-local Intl formatter for a day/month label, so the local frame it was
 * built in cancels out and the rendered label is timezone-stable.
 */
function localDateFromISO(iso: string): Date {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  const d = Number(iso.slice(8, 10))
  return new Date(y, m - 1, d)
}

/** YYYY-MM-DD `delta` days from `iso`, built and read in one local frame (tz-stable). */
function addDaysISO(iso: string, delta: number): string {
  const base = localDateFromISO(iso)
  base.setDate(base.getDate() + delta)
  return toISODate(base)
}

const thaiDayShort = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' })
const thaiDayShortYear = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/**
 * Group label for the "recent transactions" ledger, grouped by transaction date:
 * "วันนี้ · 29 ก.ค." for today, "เมื่อวาน · 28 ก.ค." for yesterday, otherwise the
 * bare "27 ก.ค." — with the Buddhist-era year appended ("9 ม.ค. 2568") only when
 * the date falls in a different year than today. "Today"/"yesterday" are reckoned
 * against the Asia/Bangkok calendar (todayISO), matching the DB, and the whole
 * comparison runs on YYYY-MM-DD strings so it can't drift by a day (rule 18).
 */
export function formatRecentDayLabel(iso: string, now: Date = new Date()): string {
  const today = todayISO(now)
  const yesterday = addDaysISO(today, -1)
  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  const label = (sameYear ? thaiDayShort : thaiDayShortYear).format(localDateFromISO(iso))
  if (iso === today) return `วันนี้ · ${label}`
  if (iso === yesterday) return `เมื่อวาน · ${label}`
  return label
}

/**
 * Label for a FUTURE occurrence date (the "รอจ่าย" tab): "วันนี้" / "พรุ่งนี้" for
 * the next two days, otherwise the bare "5 ส.ค." — with the Buddhist-era year
 * appended only when the date falls in a different year than today. Mirror of
 * formatRecentDayLabel but forward-looking (พรุ่งนี้, not เมื่อวาน). Reckoned on
 * Asia/Bangkok YYYY-MM-DD strings throughout, never new Date('YYYY-MM-DD'), so it
 * can't drift a day in a negative-offset timezone (rule 18 / F-25).
 */
export function formatUpcomingDayLabel(iso: string, now: Date = new Date()): string {
  const today = todayISO(now)
  const tomorrow = addDaysISO(today, 1)
  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  const label = (sameYear ? thaiDayShort : thaiDayShortYear).format(localDateFromISO(iso))
  if (iso === today) return `วันนี้ · ${label}`
  if (iso === tomorrow) return `พรุ่งนี้ · ${label}`
  return label
}

/**
 * Days remaining in this month, **including today** (Asia/Bangkok calendar).
 * Today counts because you can still spend today, so the daily-allowance figure
 * (safeToSpend / daysLeft) doesn't jump the moment the clock ticks past midnight.
 * The day number is read verbatim from the Bangkok YYYY-MM-DD (never
 * new Date(str).getDate()) so it can't drift in a negative-offset timezone
 * (F-25/F-26). The single source of truth for "how many days are left" — both
 * the home summary and the budget page route through here (convention 10).
 */
export function daysLeftInMonth(now: Date = new Date()): number {
  return daysLeftInMonthKey(monthKey(now), now)
}

/**
 * Days remaining in the month named by `key`, counting today (Asia/Bangkok).
 * Splitting "which month" (key) from "what day is it" (now) is the whole point:
 * once you view a past month, the two diverge and must not be conflated.
 *   key in the past    → 0   (the month is over — no days left to spend)
 *   key = current month → identical to the old daysLeftInMonth(now)
 *   key in the future   → the whole month (the UI already blocks this; defining
 *                         it beats leaving it ambiguous)
 * The comparison is on 'YYYY-MM' strings, so it can't drift a day.
 */
export function daysLeftInMonthKey(key: string, now: Date = new Date()): number {
  const nowKey = monthKey(now)
  if (key < nowKey) return 0
  if (key > nowKey) return monthBoundsFromKey(key).days
  return monthBoundsFromKey(key).days - dayOfMonthISO(todayISO(now)) + 1
}

/**
 * Whole days elapsed from the Bangkok-calendar day of `isoTimestamp` to the
 * Bangkok-calendar day of `now` (min 0). Both sides are reduced to their
 * Asia/Bangkok Y/M/D *first*, then compared — so an item created at 01:00 ICT
 * (which is the previous evening in UTC) ages by the Bangkok day it was
 * recorded on, never the UTC day. Never `(a.getTime() - b.getTime())/86400000`
 * (drifts across a DST/offset boundary) and never `new Date('YYYY-MM-DD')`
 * (parses as UTC midnight and shifts a day in negative-offset zones) — F-25/F-26.
 *
 * `isoTimestamp` is a full timestamptz (e.g. stock_items.created_at); it is a
 * real instant, so `new Date(isoTimestamp)` is correct here — the ban is on
 * date-*only* strings, which this never is.
 */
export function daysSince(isoTimestamp: string, now: Date = new Date()): number {
  const from = bangkokYMD(new Date(isoTimestamp))
  const to = bangkokYMD(now)
  // Re-anchor each Bangkok date at UTC midnight in the SAME (UTC) frame, so the
  // difference is a pure calendar-day count with no timezone offset left in it.
  const fromDay = Date.UTC(from.y, from.m - 1, from.d)
  const toDay = Date.UTC(to.y, to.m - 1, to.d)
  return Math.max(0, Math.round((toDay - fromDay) / 86400000))
}

/**
 * Month window for an explicit 'YYYY-MM' key. The month-arithmetic technique is
 * copied verbatim from monthBounds: building via new Date(y, m, …) then toISODate
 * keeps construction and read in the same (device-local) frame, so they cancel
 * and the strings are tz-stable — the key is already an absolute Bangkok month,
 * so nothing here is timezone-sensitive. `days` is read from new Date(y, m+1, 0)
 * in that same frame.
 */
export function monthBoundsFromKey(key: string): MonthBounds {
  const y = Number(key.slice(0, 4))
  const month1 = Number(key.slice(5, 7)) // 1–12
  const m = month1 - 1 // 0-indexed for Date()
  return {
    start: toISODate(new Date(y, m, 1)),
    next: toISODate(new Date(y, m + 1, 1)),
    prevStart: toISODate(new Date(y, m - 1, 1)),
    days: new Date(y, m + 1, 0).getDate(),
    key,
  }
}

/**
 * Month window for "now" (default) or any instant, seeded from the Bangkok
 * calendar. A thin wrapper over monthBoundsFromKey so there is exactly one month
 * formula in the file (convention 10); the seed year/month is the only
 * timezone-sensitive part, and that's Bangkok.
 */
export function monthBounds(now: Date = new Date()): MonthBounds {
  return monthBoundsFromKey(monthKey(now))
}

/**
 * A [from, to) date window spanning the last `n` calendar months ending with (and
 * including) `key`'s month. `from` is the 1st of the month (n−1) months earlier,
 * `to` is the 1st of the month AFTER `key` (exclusive) — the same inclusive-start /
 * exclusive-end shape stock_sales_summary and the transactions queries expect.
 * Built on addMonthsToKey + monthBoundsFromKey so all the month arithmetic (incl.
 * year rollovers) stays in the one tz-stable place (convention 10). n must be ≥ 1.
 */
export function trailingMonthsBounds(key: string, n: number): { from: string; to: string; key: string } {
  const startKey = addMonthsToKey(key, -(n - 1))
  return { from: monthBoundsFromKey(startKey).start, to: monthBoundsFromKey(key).next, key }
}
