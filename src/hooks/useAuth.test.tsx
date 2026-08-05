// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'

/**
 * The single sign-out path in the app also wipes the locally-saved AI transcript
 * (task 7). Every account is created by the owner and can share one device, so a
 * lingering transcript would show the next person to sign in the previous one's
 * financial conversation. This proves the clear happens at that one place.
 */
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => auth.getSession(...a),
      onAuthStateChange: (...a: unknown[]) => auth.onAuthStateChange(...a),
      signOut: (...a: unknown[]) => auth.signOut(...a),
    },
  },
}))

import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { loadChatHistory, saveChatHistory } from '@/lib/prefs'

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(AuthProvider, null, children)

beforeEach(() => {
  localStorage.clear()
  auth.getSession.mockResolvedValue({ data: { session: null } })
  auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
  auth.signOut.mockResolvedValue({ error: null })
})
afterEach(() => {
  localStorage.clear()
  auth.getSession.mockReset()
  auth.onAuthStateChange.mockReset()
  auth.signOut.mockReset()
})

describe('signOut clears the saved chat transcript (task 7)', () => {
  it('wipes stored history and calls supabase signOut', async () => {
    saveChatHistory([
      { role: 'user', text: 'ความลับการเงินของฉัน' },
      { role: 'assistant', text: 'จ่าย ฿9,999' },
    ])
    expect(loadChatHistory()).toHaveLength(2)

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.signOut()
    })

    expect(auth.signOut).toHaveBeenCalledTimes(1)
    // the next person to sign in on this shared device sees nothing of the last chat
    expect(loadChatHistory()).toEqual([])
  })
})
