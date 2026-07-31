// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLongPress } from '@/hooks/useLongPress'

// Render the hook, drive the handlers it returns directly with plain objects —
// no synthetic PointerEvent, no DOM element. The gesture math lives entirely in
// the handlers, so this exercises the real state machine.
function setup() {
  const onTap = vi.fn()
  const onLongPress = vi.fn()
  const { result } = renderHook(() => useLongPress({ onTap, onLongPress }))
  return { onTap, onLongPress, h: () => result.current }
}

const at = (x: number, y = 0) => ({ clientX: x, clientY: y })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useLongPress', () => {
  it('1) holding past the delay fires onLongPress once, never onTap', () => {
    const { onTap, onLongPress, h } = setup()
    h().onPointerDown(at(0))
    vi.advanceTimersByTime(500)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    expect(onTap).not.toHaveBeenCalled()
  })

  it('2) a quick press-release then click fires onTap, never onLongPress', () => {
    const { onTap, onLongPress, h } = setup()
    h().onPointerDown(at(0))
    vi.advanceTimersByTime(200)
    h().onPointerUp()
    h().onClick()
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('3) after a long-press, the trailing click is suppressed (no double action)', () => {
    const { onTap, onLongPress, h } = setup()
    h().onPointerDown(at(0))
    vi.advanceTimersByTime(500)
    h().onPointerUp()
    h().onClick()
    expect(onLongPress).toHaveBeenCalledTimes(1)
    expect(onTap).not.toHaveBeenCalled()
  })

  it('4) a swipe past tolerance cancels the long-press AND suppresses the tap', () => {
    // The most important case: browsing the label row must never save money.
    const { onTap, onLongPress, h } = setup()
    h().onPointerDown(at(0))
    h().onPointerMove(at(40))
    vi.advanceTimersByTime(500)
    h().onClick()
    expect(onLongPress).not.toHaveBeenCalled()
    expect(onTap).not.toHaveBeenCalled()
  })

  it('5) a tiny jitter within tolerance still lets the long-press fire', () => {
    const { onLongPress, h } = setup()
    h().onPointerDown(at(0))
    h().onPointerMove(at(3))
    vi.advanceTimersByTime(500)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('6) a bare click with no preceding pointer event fires onTap (keyboard)', () => {
    const { onTap, h } = setup()
    h().onClick()
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('7) pointerCancel stops the timer so onLongPress never fires', () => {
    const { onLongPress, h } = setup()
    h().onPointerDown(at(0))
    h().onPointerCancel()
    vi.advanceTimersByTime(500)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('8) a move AFTER the finger lifts does not suppress the next tap', () => {
    // Desktop: tap a chip with the mouse, then the cursor drifts across it (a
    // pointermove with no button down). endPress() must forget the start point,
    // or that stray move measures from the old coords, trips the tolerance, and
    // swallows the following click — which for keyboard users (Tab back, Enter,
    // no pointerdown to reset the flag) means the press does nothing once.
    const { onTap, h } = setup()
    h().onPointerDown(at(0))
    h().onPointerUp()
    h().onPointerMove(at(40))
    h().onClick()
    expect(onTap).toHaveBeenCalledTimes(1)
  })
})
