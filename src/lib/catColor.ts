/**
 * Category colour: the DB stores a slot (`categories.color_index`, 1–6), the
 * client owns the looks. This is the ONE place that maps a slot to its CSS
 * variable — the same `--color-cat-N` tokens tailwind.config.ts references, so
 * the donut arcs, legend swatches, and category icons all pull from one palette
 * (defined per-theme in index.css). Anything outside 1–6 — null (uncategorised),
 * or a stray value — falls back to the neutral `--color-cat-other`.
 *
 * Returns an `rgb(var(...))` string (the tokens are space-separated R G B triples,
 * so they must be wrapped in rgb()) usable directly as an SVG stroke/fill or a CSS
 * `color` (Tabler icons paint from `currentColor`). No raw hex ever leaves here.
 */
export function catColorVar(colorIndex: number | null | undefined): string {
  const slot =
    typeof colorIndex === 'number' && Number.isInteger(colorIndex) && colorIndex >= 1 && colorIndex <= 6
      ? String(colorIndex)
      : 'other'
  return `rgb(var(--color-cat-${slot}))`
}
