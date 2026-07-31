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
}

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
