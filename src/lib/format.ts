/** Money + date formatting helpers (Thai locale, tabular figures in the UI). */

const baht = new Intl.NumberFormat('th-TH', {
  maximumFractionDigits: 0,
})

const baht2 = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Placeholder shown in place of a baht figure while "ซ่อนยอดเงิน" is on.
 *  One source of truth so every hide-balance surface masks the same way
 *  (WovenHero keeps its own wider big/mini masks for the hero headline). */
export const MASKED_BAHT = '฿ ••••'

/** ฿1,234 — no decimals (used in most ledger rows/heroes). */
export function formatBaht(value: number): string {
  return `฿${baht.format(value)}`
}

/** ฿1,234.00 — two decimals (keypad/amount entry). */
export function formatBaht2(value: number): string {
  return `฿${baht2.format(value)}`
}

/** Signed amount with income/expense color intent left to the caller. */
export function formatSigned(value: number, type: 'income' | 'expense'): string {
  const sign = type === 'income' ? '+' : '-'
  return `${sign}${formatBaht(Math.abs(value))}`
}

/** e.g. "20 ก.ค." */
export function formatDayShort(date: Date): string {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' }).format(date)
}

/** Buddhist-era month label, e.g. "กรกฎาคม 2569". */
export function formatMonthLong(date: Date): string {
  return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric' }).format(date)
}

/** Short Buddhist-era month label, e.g. "ก.ค. 2569". */
export function formatMonthShort(date: Date): string {
  return new Intl.DateTimeFormat('th-TH', { month: 'short', year: 'numeric' }).format(date)
}

/**
 * Build-stamp timestamp, e.g. "30 ก.ค. 2569 18:42" — Buddhist-era date + 24h
 * Bangkok time, for the Settings version line. `iso` is a full ISO timestamp
 * (the __BUILD_TIME__ define), so `new Date(iso)` is unambiguous — this is not
 * the date-only `new Date('YYYY-MM-DD')` pitfall (convention 18); the timezone
 * is pinned to Bangkok so the stamp reads the same on any device. */
export function formatBuildStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  }).format(d)
}
