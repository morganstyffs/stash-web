import { dayOfMonthISO, monthBounds, todayISO } from './dates'

export type PaceState = 'over' | 'fast' | 'unused' | 'on_track'

export interface Pace {
  state: PaceState
  /** used / budget, 0..∞ */
  ratio: number
  pct: number
  /** budget − used, as-is: negative when over budget, NEVER clamped to 0. The
   *  note builder shows `over` for the over case; this stays the true figure. */
  remaining: number
  /** used − budget when over, else 0 — the overshoot the note shows directly. */
  over: number
}

/** The date-independent part of the verdict: over / unused / on_track. 'fast'
 *  (spending outrunning the elapsed days) is the ONLY pace call that needs the
 *  date, so it is layered on top in computePace and left off for a closed month
 *  (computePaceStatic). No component re-derives this — both entry points share it. */
function baseState(used: number, budget: number): Exclude<PaceState, 'fast'> {
  if (used > budget && budget > 0) return 'over'
  if (used === 0 && budget > 0) return 'unused'
  return 'on_track'
}

function paceAmounts(used: number, budget: number): Pick<Pace, 'ratio' | 'pct' | 'remaining' | 'over'> {
  const ratio = budget > 0 ? used / budget : 0
  return {
    ratio,
    pct: Math.round(ratio * 100),
    remaining: budget - used,
    over: used > budget ? used - budget : 0,
  }
}

/**
 * Classifies spending pace for a category against the elapsed month fraction —
 * the single source that decides a row's state (the note wording lives in
 * lib/budgetNote's paceNote, driven by this state). `now` is injectable purely
 * so tests can pin the date (the elapsed-fraction branch is otherwise
 * time-dependent); it defaults to the current time, so runtime is unchanged.
 */
export function computePace(used: number, budget: number, now = new Date()): Pace {
  const amounts = paceAmounts(used, budget)
  const base = baseState(used, budget)
  const b = monthBounds(now)
  // Bangkok day-of-month (not the device-local getDate()) so elapsed matches the
  // Bangkok month window computed above.
  const elapsed = dayOfMonthISO(todayISO(now)) / b.days // fraction of month gone
  // 'fast' only upgrades an otherwise on_track row — over/unused keep their state.
  const state: PaceState =
    base === 'on_track' && budget > 0 && amounts.ratio > elapsed * 1.1 ? 'fast' : base
  return { state, ...amounts }
}

/**
 * Pace for a CLOSED month — same states minus 'fast'. A month that's over has no
 * days left to be ahead or behind of, so the elapsed comparison is meaningless
 * (calling computePace with today's date would measure the WRONG month). Shares
 * baseState with computePace so "over / unused / on_track" is decided in one
 * place, never re-inlined in the page.
 */
export function computePaceStatic(used: number, budget: number): Pace {
  return { state: baseState(used, budget), ...paceAmounts(used, budget) }
}
