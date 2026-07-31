import { BrandMark } from '@/components/BrandMark'

/**
 * Mark + wordmark lockup for the signed-out screens (Login / Reset / Forgot),
 * replacing the old stash-logo.svg lockup. The wordmark is live Prompt text (the
 * design font, already loaded) — not baked SVG paths — so it stays crisp at any
 * size and needs no separate asset.
 *
 * Colour note: the auth card is `bg-white` in BOTH themes, so the wordmark uses
 * `text-brand` (a theme-CONSTANT indigo) rather than `text-ink` (which flips light
 * in dark mode and would vanish on the white card). The mark is decorative — the
 * "Stash" text carries the accessible name.
 */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <BrandMark variant="full" size={34} className="text-mint" />
      <span className="text-[26px] font-medium leading-none tracking-tight text-brand">Stash</span>
    </span>
  )
}
