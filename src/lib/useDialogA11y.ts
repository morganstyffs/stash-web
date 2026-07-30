import { useEffect, useRef } from 'react'

/**
 * Shared keyboard/focus behaviour for every bottom-sheet/dialog in the app.
 * There are six independent backdrop implementations (Overlay, ConfirmDialog,
 * StockEditSheet, TransactionEditSheet, BudgetPage's editor, StockQueuePage's
 * detail sheet) — this hook is the one place their a11y behaviour lives, so
 * all six move together instead of drifting apart.
 *
 * - Escape calls `onClose`.
 * - Tab is trapped inside the panel while open (Tab from the last focusable
 *   element wraps to the first, Shift+Tab from the first wraps to the last).
 * - Focus moves into the panel on mount and returns to whatever was focused
 *   before it opened, on unmount.
 *
 * `active` lets a caller skip wiring listeners until there's actually
 * something to trap focus inside (e.g. ConfirmDialog passes `!busy`).
 */
export function useDialogA11y(onClose: () => void, active = true) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )

    focusable()[0]?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [active, onClose])

  return panelRef
}
