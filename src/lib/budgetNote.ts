import type { PaceState } from './budgetPace'

/**
 * The wording for a category's budget note — kept in ONE place so the per-category
 * secondary line (BudgetPage) and the over-budget chip on the home hero (WovenHero)
 * can never drift into two phrasings of "เกินงบ ฿X" (convention 3).
 *
 * Every helper takes an injected `money` formatter instead of calling formatBaht
 * itself, so the caller decides masking: pass formatBaht normally, or a
 * hideBalance-aware formatter that returns MASKED_BAHT. The baht amounts arrive
 * pre-computed (never re-derived here) and are shown as-is — an over-budget note
 * shows the real overshoot, never clamped to 0.
 */

/** Category budgeted but nothing spent yet. No warning — there's nothing to warn
 *  about, so this stays a plain fact, not a coloured cue. */
export const UNUSED_NOTE = 'ยังไม่ได้ใช้'

/** "เกินงบ ฿1,200" — how far over budget. Shared by the hero over-budget chip and
 *  the per-category note so both read identically. */
export function overBudgetNote(over: number, money: (v: number) => string): string {
  return `เกินงบ ${money(over)}`
}

/** "เหลือ ฿9,500" — budget still available (the decision number a normal row shows
 *  instead of a verdict word). */
export function remainingNote(remaining: number, money: (v: number) => string): string {
  return `เหลือ ${money(remaining)}`
}

/**
 * The full secondary line for a category, chosen by its pace state. computePace
 * (useBudgets.ts) is the single decider of `state`; this only maps a state to
 * words. The 'fast' line leads with the remaining number and appends the pace
 * warning, so the useful figure comes first and the warning rides second.
 */
export function paceNote(
  state: PaceState,
  amounts: { remaining: number; over: number },
  money: (v: number) => string,
): string {
  switch (state) {
    case 'over':
      return overBudgetNote(amounts.over, money)
    case 'unused':
      return UNUSED_NOTE
    case 'fast':
      return `${remainingNote(amounts.remaining, money)} · ใช้เร็วกว่าจังหวะ`
    case 'on_track':
      return remainingNote(amounts.remaining, money)
  }
}
