/** Date helpers for month-scoped queries. Local time (Thai user, no UTC shift). */

/** Local YYYY-MM-DD for a Date (Supabase `date` columns are timezone-naive). */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

export function monthBounds(now = new Date()): MonthBounds {
  const y = now.getFullYear()
  const m = now.getMonth()
  const start = new Date(y, m, 1)
  const next = new Date(y, m + 1, 1)
  const prevStart = new Date(y, m - 1, 1)
  return {
    start: toISODate(start),
    next: toISODate(next),
    prevStart: toISODate(prevStart),
    days: new Date(y, m + 1, 0).getDate(),
    key: `${y}-${String(m + 1).padStart(2, '0')}`,
  }
}
