/**
 * The SAFE-label sub-line, decided from money alone: which figures to show, and
 * — the part that matters — when NOT to. Rendering + hide-balance masking live in
 * WovenHero; this stays a pure function so the "never a negative daily rate, never
 * a silent clamp to 0" rule (audit B2, first fixed on the budget label) is decided
 * and unit-tested in ONE place (convention 4: money logic lives in lib/).
 *
 * `bills` is the sum of recurring EXPENSE occurrences still to be charged this
 * month (see useUpcomingBills) — money that's already committed, so it must not
 * count as spendable. Pass 0 when there are none, and the sub-line is exactly the
 * original average-per-day line.
 */
export interface SpendableView {
  /** days left in the month, today included (from daysLeftInMonth) */
  daysLeft: number
  /** upcoming recurring expenses still to hit this month (0 = none) */
  bills: number
  /**
   * Amount committed BEYOND what's available, i.e. bills − safeToSpend when that
   * is positive, else 0. Surfaced as an over-committed warning — we never print a
   * negative "ใช้ได้วันละ" and never quietly clamp the shortfall to zero.
   */
  over: number
  /**
   * Spendable per remaining day AFTER bills, or null when there's no honest rate
   * to show: the month is already over (daysLeft ≤ 0), nothing is left, or we're
   * over-committed (the `over` warning carries the message instead).
   */
  perDay: number | null
}

/**
 * Decide the SAFE sub-line from safe-to-spend, the upcoming-bills total, and the
 * days left. Pure; see SpendableView for the contract. With `bills = 0` this
 * reproduces the original line: average-per-day when there's a positive balance
 * and days remaining, otherwise just "N days left".
 */
export function computeSpendable(
  safeToSpend: number,
  bills: number,
  daysLeft: number,
): SpendableView {
  const b = bills > 0 ? bills : 0
  const remaining = safeToSpend - b
  // Only a genuine shortfall against BILLS is an "over-committed" warning; a plain
  // negative safe-to-spend with no bills keeps the original quiet "N days left".
  const over = b > 0 && remaining < 0 ? -remaining : 0
  // A rate only when the month still has days AND there's a non-negative amount to
  // spread. Over-committed or month-over → null, so we never divide into a rate
  // that would read as a negative or a clamped-to-0 lie.
  const perDay = daysLeft > 0 && remaining > 0 ? remaining / daysLeft : null
  return { daysLeft, bills: b, over, perDay }
}
