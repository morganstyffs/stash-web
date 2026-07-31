import type { TransactionType } from '@/lib/db'

/**
 * The minimal row shape the hint functions read. Declared here as a structural
 * shape — never imported from `hooks/`, because `lib/` travels one way and must
 * not depend on the query layer (§3, convention 11). The hook's own `HintRow`
 * is structurally assignable to this, so callers pass their rows straight in.
 */
export interface HintRowLike {
  type: TransactionType
  category_id: string | null
  wallet_id: string | null
  date: string
  amount: number
}

/** How many past entries a category needs before its median is trusted enough
 *  to warn against — guessing "typical" from 2 rows is noise, not a signal. */
export const TYPICAL_MIN_SAMPLES = 5
/** How many times the typical amount an entry must reach to be flagged unusual.
 *  The owner's call: 10× (a stray extra zero is exactly a 10× overshoot). */
export const UNUSUAL_MULTIPLIER = 10

/** Running tally for one candidate: how often it was used, and the newest date. */
interface Tally {
  count: number
  latest: string
}

/**
 * Fold a row into a per-key tally, tracking both a count and the newest date so
 * a tie on count can be broken by recency. `date` is a YYYY-MM-DD string, so a
 * plain `>` compares chronologically without ever building a Date (rule 17/18).
 */
function bump(stats: Map<string, Tally>, key: string, date: string): void {
  const cur = stats.get(key)
  if (cur) {
    cur.count += 1
    if (date > cur.latest) cur.latest = date
  } else {
    stats.set(key, { count: 1, latest: date })
  }
}

/**
 * The wallet used most often with this category — or null when there is no
 * history to guess from. Ties go to the wallet used most recently; a further tie
 * (same count, same newest date) is broken by the wallet id so the result is
 * fully deterministic and never depends on the order the DB returned the rows —
 * two devices reading the same history must guess the same wallet. Rows whose
 * `wallet_id` is null (the schema allows a wallet-less entry) are not counted.
 */
export function preferredWalletFor(rows: HintRowLike[], categoryId: string): string | null {
  const stats = new Map<string, Tally>()
  for (const r of rows) {
    if (r.category_id !== categoryId) continue
    if (r.wallet_id == null) continue
    bump(stats, r.wallet_id, r.date)
  }

  let best: string | null = null
  let bestStat: Tally | null = null
  for (const [wallet, s] of stats) {
    if (
      bestStat === null ||
      s.count > bestStat.count ||
      (s.count === bestStat.count && s.latest > bestStat.latest) ||
      (s.count === bestStat.count && s.latest === bestStat.latest && wallet < (best as string))
    ) {
      best = wallet
      bestStat = s
    }
  }
  return best
}

/**
 * Ids of the categories used most often for this transaction type, most-used
 * first, capped at `limit`. Ties go to the category used most recently, then to
 * the category id — a total order, so the ranking never depends on the order the
 * DB returned the rows (the same history always ranks the same way). Rows with a
 * null `category_id` are not counted.
 */
export function topCategories(
  rows: HintRowLike[],
  type: TransactionType,
  limit: number,
): string[] {
  const stats = new Map<string, Tally>()
  for (const r of rows) {
    if (r.type !== type) continue
    if (r.category_id == null) continue
    bump(stats, r.category_id, r.date)
  }

  return [...stats.entries()]
    .sort((a, b) => {
      const [aId, aStat] = a
      const [bId, bStat] = b
      if (bStat.count !== aStat.count) return bStat.count - aStat.count
      if (bStat.latest !== aStat.latest) return bStat.latest > aStat.latest ? 1 : -1
      return aId < bId ? -1 : 1
    })
    .slice(0, limit)
    .map(([id]) => id)
}

/**
 * The "typical" amount for a category+type = the MEDIAN of its past amounts, or
 * null when there are fewer than TYPICAL_MIN_SAMPLES to trust. Median, not mean:
 * one large outlier (a rent payment in a mixed category) drags the mean up and
 * would raise the whole category's threshold, letting real slips slide by. The
 * amounts are sorted before the middle is read, so the result never depends on
 * the order the DB returned the rows (a device sees the same "typical" every
 * time). An even sample count returns the average of the two middle values.
 */
export function typicalAmountFor(
  rows: HintRowLike[],
  categoryId: string,
  type: TransactionType,
): number | null {
  const amounts: number[] = []
  for (const r of rows) {
    if (r.category_id !== categoryId) continue
    if (r.type !== type) continue
    amounts.push(r.amount)
  }
  if (amounts.length < TYPICAL_MIN_SAMPLES) return null
  amounts.sort((a, b) => a - b)
  const mid = amounts.length >> 1
  return amounts.length % 2 === 0 ? (amounts[mid - 1] + amounts[mid]) / 2 : amounts[mid]
}

/**
 * Is `amount` about to be entered unusually high for this category+type? Returns
 * the typical (median) amount it was compared against — so the UI can name the
 * baseline in the warning ("หมวดนี้ปกติราว ฿250") rather than flagging it blindly —
 * or null when there is nothing to warn about:
 *   - no category chosen yet (categoryId null)            → null
 *   - a non-positive amount (empty / cleared field)       → null
 *   - too little history to have a trusted median         → null
 *   - amount below median × UNUSUAL_MULTIPLIER            → null
 * This is a warning signal only — it never blocks the save (§2 of PR-35).
 */
export function unusualAmountBaseline(
  rows: HintRowLike[],
  categoryId: string | null,
  type: TransactionType,
  amount: number,
): number | null {
  if (categoryId == null) return null
  if (amount <= 0) return null
  const median = typicalAmountFor(rows, categoryId, type)
  if (median == null) return null
  return amount >= median * UNUSUAL_MULTIPLIER ? median : null
}
