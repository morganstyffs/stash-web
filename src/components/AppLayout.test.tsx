// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// AppLayout owns three data hooks (recurring backfill, the ยอดค้าง badge count, and
// the AI-consent read that gates the "ถาม AI" entry); stub all so this stays a pure
// routing/structure test with no data layer. Consent defaults to undefined here (the
// AI entry hidden) — its show/hide behaviour is covered by AppLayout.consent.test.tsx.
vi.mock('@/hooks/useRecurring', () => ({ useRunRecurringOnLoad: () => {} }))
vi.mock('@/hooks/useFriends', () => ({ useDebtsBadgeCount: () => ({ data: 0 }) }))
vi.mock('@/hooks/useAiSettings', () => ({ useConsent: () => ({ data: undefined }) }))

import { AppLayout, BottomNav } from '@/components/AppLayout'

afterEach(cleanup)

/** hrefs of every <a> inside `root`, in document order. */
function hrefs(root: HTMLElement): string[] {
  return within(root)
    .queryAllByRole('link')
    .map((a) => a.getAttribute('href') ?? '')
}

describe('mobile bottom nav — 4 tabs + centre FAB, no ตั้งค่า', () => {
  it('links to exactly หน้าหลัก · ประวัติ · ยอดค้าง · สต็อก, in order', () => {
    const { container } = render(
      <MemoryRouter>
        <BottomNav hasBadge={false} />
      </MemoryRouter>,
    )
    expect(hrefs(container)).toEqual(['/', '/history', '/debts', '/stock'])
  })

  it('does NOT include ตั้งค่า or งบ in the bottom bar (they moved off mobile)', () => {
    const { container } = render(
      <MemoryRouter>
        <BottomNav hasBadge={false} />
      </MemoryRouter>,
    )
    const links = hrefs(container)
    expect(links).not.toContain('/settings')
    expect(links).not.toContain('/budget')
  })

  it('keeps the centre add FAB reachable by its Thai label', () => {
    render(
      <MemoryRouter>
        <BottomNav hasBadge={false} />
      </MemoryRouter>,
    )
    expect(screen.getByLabelText('เพิ่มรายการ')).toBeTruthy()
  })

  it('renders each tab with its Thai label (so the bar reads as labelled tabs)', () => {
    render(
      <MemoryRouter>
        <BottomNav hasBadge={false} />
      </MemoryRouter>,
    )
    for (const label of ['หน้าหลัก', 'ประวัติ', 'ยอดค้าง', 'สต็อก']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })
})

describe('desktop nav rail — still reaches ตั้งค่า and งบ', () => {
  it('keeps every destination inline, including /budget and /settings', () => {
    const { container } = render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    )
    // The rail is the only <nav> in the layout; the bottom bar is a plain div.
    const rail = container.querySelector('nav')
    expect(rail).not.toBeNull()
    // The rail links include the Stash logo (href "/") plus the six destinations;
    // assert every destination is present — budget + settings above all, since
    // this mobile change must not strip the desktop entries.
    const railLinks = hrefs(rail as HTMLElement)
    for (const dest of ['/', '/history', '/debts', '/budget', '/stock', '/settings']) {
      expect(railLinks, `rail is missing ${dest}`).toContain(dest)
    }
  })
})
