// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Consent gate for the "ถาม AI" entry points (design §5 / task §1). The button must
 * appear ONLY when consent = 'on'; never_chosen / off / still-loading hide it, so no
 * one is ever sent to a chat that would only 403. AppLayout renders two entries — the
 * mobile pill and the desktop rail icon — both labelled "ถาม AI".
 */

const state = vi.hoisted(() => ({ consent: 'on' as 'on' | 'off' | 'never_chosen' | undefined }))

vi.mock('@/hooks/useRecurring', () => ({ useRunRecurringOnLoad: () => {} }))
vi.mock('@/hooks/useFriends', () => ({ useDebtsBadgeCount: () => ({ data: 0 }) }))
vi.mock('@/hooks/useAiSettings', () => ({ useConsent: () => ({ data: state.consent }) }))

import { AppLayout } from '@/components/AppLayout'

beforeEach(() => {
  state.consent = 'on'
})
afterEach(cleanup)

function renderLayout() {
  return render(
    <MemoryRouter>
      <AppLayout />
    </MemoryRouter>,
  )
}

describe('"ถาม AI" entry appears only when consent is on', () => {
  it("consent 'on' → both the mobile pill and the desktop rail entry are present", () => {
    renderLayout()
    // one pill (BottomNav) + one rail icon = two entries labelled "ถาม AI"
    expect(screen.getAllByLabelText('ถาม AI')).toHaveLength(2)
  })

  for (const hidden of ['off', 'never_chosen', undefined] as const) {
    it(`consent '${hidden ?? 'loading'}' → no "ถาม AI" entry anywhere`, () => {
      state.consent = hidden
      renderLayout()
      expect(screen.queryAllByLabelText('ถาม AI')).toHaveLength(0)
    })
  }
})
