// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

/**
 * The contextual "ถาม AI เรื่องนี้" button used on the budget / stock screens
 * (task 5b §2). Two invariants proven here:
 *  • consent gate — visible ONLY when consent = 'on'; off / never_chosen / loading
 *    render nothing, so nobody is sent to /ai only to be bounced to Settings.
 *  • it navigates to /ai?q=<question>, URL-encoded, so AiPage can prefill the
 *    composer. (That it does NOT auto-send is proven on the AiPage side —
 *    AiPage.deeplink.test.tsx — since this button only ever navigates.)
 */

const state = vi.hoisted(() => ({
  consent: 'on' as 'on' | 'off' | 'never_chosen' | undefined,
}))

vi.mock('@/hooks/useAiSettings', () => ({ useConsent: () => ({ data: state.consent }) }))

import { AskAiButton } from '@/components/AskAiButton'

/** Renders the last-navigated pathname + raw search so a click's target is assertable. */
function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.pathname + loc.search}</div>
}

function renderButton(question = 'งบเดือนนี้เหลือเท่าไหร่') {
  return render(
    <MemoryRouter initialEntries={['/budget']}>
      <Routes>
        <Route path="/budget" element={<AskAiButton question={question} />} />
        <Route path="/ai" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.consent = 'on'
})
afterEach(cleanup)

describe('AskAiButton — consent gate', () => {
  it("consent 'on' → the button is shown", () => {
    renderButton()
    expect(screen.getByText('ถาม AI เรื่องนี้')).toBeTruthy()
  })

  for (const hidden of ['off', 'never_chosen', undefined] as const) {
    it(`consent '${hidden ?? 'loading'}' → nothing is rendered`, () => {
      state.consent = hidden
      const { container } = renderButton()
      expect(screen.queryByText('ถาม AI เรื่องนี้')).toBeNull()
      expect(container.querySelector('button')).toBeNull()
    })
  }
})

describe('AskAiButton — navigation carries the preset question', () => {
  it('clicking navigates to /ai with the question URL-encoded in ?q=', () => {
    renderButton('งบเดือนนี้เหลือเท่าไหร่')
    fireEvent.click(screen.getByText('ถาม AI เรื่องนี้'))
    const target = screen.getByTestId('loc').textContent ?? ''
    expect(target.startsWith('/ai?q=')).toBe(true)
    // decode back to the exact preset — proves the whole question rides the URL intact
    const q = new URLSearchParams(target.slice('/ai'.length)).get('q')
    expect(q).toBe('งบเดือนนี้เหลือเท่าไหร่')
  })

  it('is a single <button> (never a button nested in a button — a past bug here)', () => {
    const { container } = renderButton()
    const btn = container.querySelector('button')
    expect(btn).toBeTruthy()
    expect(btn?.querySelector('button')).toBeNull()
  })
})
