import { useEffect, useRef } from 'react'

// Module-level stack of currently-open dialogs, most recent last. Lets a stack of
// dialogs (e.g. a manager sheet with a ConfirmDialog on top of it) each call this
// hook independently while only the topmost one actually reacts to Escape/Tab —
// otherwise every open dialog's listener fires for the same keypress at once.
let openStack: symbol[] = []

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
 * - Only the topmost open dialog reacts to Escape/Tab: when a ConfirmDialog
 *   stacks on top of a manager sheet, both call this hook, but the one
 *   underneath goes quiet (its handler no-ops) until the top one closes.
 *
 * `active` lets a caller skip wiring listeners until there's actually
 * something to trap focus inside (e.g. ConfirmDialog passes `!busy`).
 */
export function useDialogA11y(onClose: () => void, active = true) {
  const panelRef = useRef<HTMLDivElement>(null)
  const idRef = useRef(Symbol())

  useEffect(() => {
    if (!active) return
    const id = idRef.current
    openStack.push(id)
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )

    focusable()[0]?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (openStack[openStack.length - 1] !== id) return // not the topmost dialog — ignore
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
      openStack = openStack.filter((x) => x !== id)
      previouslyFocused?.focus()
    }
  }, [active, onClose])

  return panelRef
}
