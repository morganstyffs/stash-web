// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Turning the AI consent switch OFF in Settings must also drop the locally-stored
 * chat transcript (task 7): the switch promises "ปิดแล้วจะไม่มีการส่งอะไรออกไปอีก",
 * and leaving the previous conversation on disk after the switch is off breaks that
 * promise. Turning it ON must NOT wipe anything.
 *
 * SettingsPage pulls in many hooks; each is mocked to the smallest shape it renders
 * from, and the sub-managers (not shown by default) are stubbed. The one real moving
 * part is prefs.ts against jsdom's localStorage — the store this test is about.
 */
const h = vi.hoisted(() => ({
  consent: 'on' as 'on' | 'off' | 'never_chosen',
  setConsent: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'owner@example.com' }, signOut: vi.fn() }),
}))
vi.mock('@/hooks/useLookups', () => ({
  useCategories: () => ({ data: [] }),
  useFavorites: () => ({ data: [] }),
}))
vi.mock('@/hooks/useSettings', () => ({
  useRecurringCount: () => ({ data: 0 }),
  useWallets: () => ({ data: [] }),
}))
vi.mock('@/hooks/useSkuConfig', () => ({
  useSkuConfig: () => ({ data: { prefix: 'STZ' } }),
}))
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ mode: 'light', setMode: vi.fn() }),
}))
vi.mock('@/hooks/useAiSettings', () => ({
  useConsent: () => ({ data: h.consent, isLoading: false }),
  useSetConsent: () => ({ mutateAsync: h.setConsent, isPending: false }),
}))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ error: h.toastError, success: vi.fn() }),
}))
// Sub-managers are opened on demand (default closed) — stub them out entirely.
vi.mock('@/components/CategoriesManager', () => ({ CategoriesManager: () => null }))
vi.mock('@/components/WalletsManager', () => ({ WalletsManager: () => null }))
vi.mock('@/components/FavoritesManager', () => ({ FavoritesManager: () => null }))
vi.mock('@/components/RecurringManager', () => ({ RecurringManager: () => null }))
vi.mock('@/components/ProfileManager', () => ({ ProfileManager: () => null }))
vi.mock('@/components/SkuManager', () => ({ SkuManager: () => null }))
vi.mock('@/components/BrandMark', () => ({ BrandMark: () => null }))

import { SettingsPage } from '@/pages/SettingsPage'
import { loadChatHistory, saveChatHistory } from '@/lib/prefs'

beforeEach(() => {
  localStorage.clear()
  h.consent = 'on'
  h.setConsent.mockReset().mockResolvedValue(undefined)
  h.toastError.mockReset()
  // The version stamp reads two build-time defines that vitest doesn't inject.
  vi.stubGlobal('__COMMIT_SHA__', 'testsha')
  vi.stubGlobal('__BUILD_TIME__', '2026-01-01T00:00:00Z')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
}

describe('consent toggle ↔ chat history (task 7)', () => {
  it('turning consent OFF clears the saved transcript', async () => {
    saveChatHistory([{ role: 'user', text: 'ความลับ' }])
    renderSettings()

    const sw = screen.getByRole('switch', { name: 'ใช้ผู้ช่วย AI' })
    expect(sw.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(sw) // → onToggleConsent(false)

    await waitFor(() => expect(h.setConsent).toHaveBeenCalledWith(false))
    await waitFor(() => expect(loadChatHistory()).toEqual([]))
  })

  it('turning consent ON does NOT wipe anything', async () => {
    h.consent = 'off'
    // (history wouldn't normally exist while off, but this proves ON never clears)
    saveChatHistory([{ role: 'user', text: 'ยังอยู่' }])
    renderSettings()

    const sw = screen.getByRole('switch', { name: 'ใช้ผู้ช่วย AI' })
    expect(sw.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(sw) // → onToggleConsent(true)

    await waitFor(() => expect(h.setConsent).toHaveBeenCalledWith(true))
    expect(loadChatHistory()).toEqual([{ role: 'user', text: 'ยังอยู่' }])
  })
})
