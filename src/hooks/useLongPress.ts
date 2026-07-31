import { useEffect, useRef } from 'react'

/** The only two coordinates the gesture math needs. Kept to this minimal shape
 *  (not React.PointerEvent) so tests call the handlers with plain objects — no
 *  cast, no reliance on jsdom's PointerEvent support (conventions 10/11). */
interface Point {
  clientX: number
  clientY: number
}

/**
 * Tap-vs-long-press on one element, as a set of DOM handlers to spread onto it.
 *
 * A tap fires `onTap`; a press held for `delayMs` without moving more than
 * `moveTolerancePx` fires `onLongPress`. The two never both fire for one gesture.
 *
 * `onTap` rides on `click`, NOT `pointerUp`, on purpose: a keyboard Enter/Space
 * on a focused <button> emits `click` alone with no pointer events, so moving
 * the tap onto pointerUp would silently kill keyboard access. A finger swipe
 * across a horizontally-scrolling row moves past the tolerance → the timer is
 * cancelled AND the following `click` is suppressed, so swiping to browse labels
 * can never turn into a save.
 */
export function useLongPress(opts: {
  onTap: () => void
  onLongPress: () => void
  delayMs?: number
  moveTolerancePx?: number
}): {
  onPointerDown: (e: Point) => void
  onPointerMove: (e: Point) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onPointerLeave: () => void
  onContextMenu: (e: { preventDefault: () => void }) => void
  onClick: () => void
} {
  const { onTap, onLongPress, delayMs = 500, moveTolerancePx = 10 } = opts

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<Point | null>(null)
  // Set when a long-press fired or the finger slid too far — makes the trailing
  // `click` a no-op so a gesture that already "did something" doesn't also tap.
  const suppressClick = useRef(false)

  function clearTimer() {
    if (timer.current != null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  // Don't leave a pending timer running if the element unmounts mid-press.
  useEffect(() => {
    return () => {
      if (timer.current != null) clearTimeout(timer.current)
    }
  }, [])

  function onPointerDown(e: Point) {
    start.current = { clientX: e.clientX, clientY: e.clientY }
    suppressClick.current = false
    clearTimer()
    timer.current = setTimeout(() => {
      timer.current = null
      suppressClick.current = true
      onLongPress()
    }, delayMs)
  }

  function onPointerMove(e: Point) {
    if (start.current == null) return
    const dx = e.clientX - start.current.clientX
    const dy = e.clientY - start.current.clientY
    if (Math.hypot(dx, dy) > moveTolerancePx) {
      clearTimer()
      suppressClick.current = true
    }
  }

  // pointerUp / cancel / leave only stop the timer — they must NOT touch
  // suppressClick, or a long-press's own pointerUp would re-enable the tap.
  function endPress() {
    clearTimer()
    // Forget the start point too: without this a pointermove that arrives AFTER
    // the finger lifts measures from the old coords, trips the tolerance, and
    // leaves suppressClick set → the NEXT click is swallowed. For keyboard users
    // (Enter has no pointerdown to reset the flag) that means the press does
    // nothing once, with nothing to explain it.
    start.current = null
  }

  function onClick() {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    onTap()
  }

  function onContextMenu(e: { preventDefault: () => void }) {
    // Kill the right-click / press-and-hold context menu so a long-press is ours.
    e.preventDefault()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPress,
    onPointerCancel: endPress,
    onPointerLeave: endPress,
    onContextMenu,
    onClick,
  }
}
