import { useEffect, useRef, useState } from 'react'
import { loadHomeMoments, saveHomeMoments } from '@/lib/prefs'

export interface HomeMoments {
  /** the calendar month rolled over since we last recorded */
  newMonth: boolean
  /** STOCK PROFIT went from empty to non-zero within the current month */
  firstSale: boolean
}

const NONE: HomeMoments = { newMonth: false, firstSale: false }

/**
 * One-shot home animations. Compares the current month + stock-active flag with
 * what we last recorded (via prefs) and returns which moment to play for this
 * mount, then records the new state. Decides once, only after `ready` (so it
 * doesn't fire on a half-loaded screen), and records silently on the very first
 * run so a brand-new user is never "welcomed" to a new month they didn't cross.
 *
 * Device-local by design (see prefs.HomeMomentState / STASH_CONTEXT) — the
 * accepted trade-off is that a second device may replay a moment once.
 */
export function useHomeMoments(ready: boolean, month: string, stockActive: boolean): HomeMoments {
  const [moments, setMoments] = useState<HomeMoments>(NONE)
  const decided = useRef(false)

  useEffect(() => {
    if (!ready || decided.current) return
    decided.current = true

    const prev = loadHomeMoments()
    // First record ever for this device/account → save baseline, celebrate nothing.
    if (prev.month === null) {
      saveHomeMoments({ month, stockActive })
      return
    }

    const newMonth = prev.month !== month
    // First sale = stock flipped empty → non-zero within the SAME month. On a
    // rollover the month moment plays instead and the new month starts fresh.
    const firstSale = !newMonth && stockActive && !prev.stockActive

    setMoments({ newMonth, firstSale })
    saveHomeMoments({ month, stockActive })
  }, [ready, month, stockActive])

  return moments
}
