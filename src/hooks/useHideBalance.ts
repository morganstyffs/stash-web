import { useState } from 'react'
import { loadHideBalance, saveHideBalance } from '@/lib/prefs'

/**
 * The "ซ่อนยอดเงิน" (hide-balance) eye, shared by every surface that shows money
 * the user might not want a shoulder-surfer to see (home hero, ยอดค้าง). One
 * place owns the state<->pref round-trip so the toggle logic isn't reimplemented
 * per page (convention 10). The value is read from localStorage once on mount
 * (via prefs.ts, the only file that touches the `stash.*` keys); navigating
 * between pages re-reads it, so a toggle on one screen is reflected on the next.
 */
export function useHideBalance(): { hideBalance: boolean; toggleHideBalance: () => void } {
  const [hideBalance, setHideBalance] = useState(loadHideBalance)
  function toggleHideBalance() {
    setHideBalance((v) => {
      const next = !v
      saveHideBalance(next)
      return next
    })
  }
  return { hideBalance, toggleHideBalance }
}
