/**
 * Whole-number percentages that always sum to exactly 100 (largest-remainder /
 * Hamilton method). Rounding each share independently with Math.round can total
 * 99 or 101 — e.g. the donut legend showing 81 + 12 + 4 + 2 = 99. Here every
 * share is floored, then the leftover points (100 − Σfloors) are handed out one
 * each to the shares with the largest fractional parts.
 *
 * Edge cases: total ≤ 0 → all zeros (nothing to divide); a single positive row
 * → [100]; a zero-valued row → 0 (it has no fractional part to win a leftover).
 */
export function largestRemainderPercents(values: number[]): number[] {
  const total = values.reduce((sum, v) => sum + v, 0)
  if (total <= 0) return values.map(() => 0)

  const exact = values.map((v) => (v / total) * 100)
  const result = exact.map((e) => Math.floor(e))
  let leftover = 100 - result.reduce((sum, f) => sum + f, 0)

  // Hand out the remaining whole points to the largest fractional parts first.
  const byFraction = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac)

  for (let k = 0; k < byFraction.length && leftover > 0; k++) {
    result[byFraction[k].i] += 1
    leftover -= 1
  }
  return result
}
