import { useEffect, useState } from 'react'

/**
 * Returns true only after `active` has stayed true for `delayMs`, and flips
 * straight back to false when `active` clears. Used for the home skeleton: a
 * cached (near-instant) load resolves before the delay elapses, so no skeleton
 * flashes; a genuinely slow load shows it after the delay.
 */
export function useDelayedFlag(active: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!active) {
      setShown(false)
      return
    }
    const id = setTimeout(() => setShown(true), delayMs)
    return () => clearTimeout(id)
  }, [active, delayMs])
  return shown
}
