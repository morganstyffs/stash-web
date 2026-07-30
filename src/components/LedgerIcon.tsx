import type { Icon as TablerIcon } from '@tabler/icons-react'

/**
 * The leading icon of a ledger row (รายการล่าสุด on Home, the History list).
 * A fixed-width column — so every row's text starts at the same x even though
 * Tabler glyphs differ in width — holding a box-less, category-coloured icon.
 *
 * `color` is any CSS colour (a `rgb(var(--color-cat-N))` from catColorVar, or a
 * brand token for stock rows); Tabler icons paint from currentColor, so it goes
 * through `style.color`. stroke 2.25 is a touch heavier than the 2 default:
 * the category palette sits at the ≥3:1 borderline, and the heavier outline keeps
 * the thin glyph legible without switching to filled icons (which the Tabler
 * registry in lib/icons.tsx doesn't provide across the board).
 */
export function LedgerIcon({ icon: Icon, color }: { icon: TablerIcon; color: string }) {
  return (
    <span className="flex w-7 shrink-0 justify-center" aria-hidden>
      <Icon size={20} stroke={2.25} style={{ color }} />
    </span>
  )
}
