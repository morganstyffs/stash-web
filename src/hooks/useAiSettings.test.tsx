// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// PR-4 — the consent reader/writer is the first and only writer of ai_settings
// (0029). Two invariants are load-bearing and proven structurally here:
//  1. "no row" (maybeSingle → data=null) is 'never_chosen', NOT an error — the
//     most important case of this slice (§3.5.1).
//  2. turning consent OFF is consent=false via upsert; NO code path ever deletes
//     a row (there is no DELETE policy, on purpose — 0029).
const from = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => from(...a) } }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))

import { useConsent, useSetConsent } from '@/hooks/useAiSettings'

/** A supabase query builder whose terminal call resolves to `result`. Every chain
 *  method returns the same thenable, so .select().eq().maybeSingle() and
 *  .upsert() both resolve to `result`. `delete` is included ONLY so a stray
 *  `.delete()` would resolve rather than throw — the tests assert it's never called. */
function builder(result: { data?: unknown; error: unknown }) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'maybeSingle', 'upsert', 'delete']) b[m] = () => b
  ;(b as { then: unknown }).then = (res: (v: unknown) => unknown) =>
    Promise.resolve(result).then(res)
  return b
}

let qc: QueryClient
function makeWrapper() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

afterEach(() => {
  from.mockReset()
})

describe('useConsent — reads three states, and "no row" is never an error', () => {
  it('no row (maybeSingle → null) resolves to never_chosen, NOT an error', async () => {
    from.mockReturnValue(builder({ data: null, error: null }))
    const { result } = renderHook(() => useConsent(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data).toBe('never_chosen'))
    expect(result.current.isError).toBe(false)
    expect(from).toHaveBeenCalledWith('ai_settings')
  })

  it('a row with consent=false → off', async () => {
    from.mockReturnValue(builder({ data: { consent: false }, error: null }))
    const { result } = renderHook(() => useConsent(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data).toBe('off'))
  })

  it('a row with consent=true → on', async () => {
    from.mockReturnValue(builder({ data: { consent: true }, error: null }))
    const { result } = renderHook(() => useConsent(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data).toBe('on'))
  })

  it('surfaces a read error instead of swallowing it', async () => {
    from.mockReturnValue(builder({ data: null, error: { message: 'boom' } }))
    const { result } = renderHook(() => useConsent(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

describe('useSetConsent — writes consent, never deletes', () => {
  it('turning ON upserts consent=true onto ai_settings (conflict target user_id, no user_id sent)', async () => {
    const upsert = vi.fn().mockReturnValue(builder({ error: null }))
    from.mockReturnValue({ upsert })
    const { result } = renderHook(() => useSetConsent(), { wrapper: makeWrapper() })

    await result.current.mutateAsync(true)

    expect(from).toHaveBeenCalledWith('ai_settings')
    expect(upsert).toHaveBeenCalledWith({ consent: true }, { onConflict: 'user_id' })
    // user_id is NOT sent — the column defaults to auth.uid() (0029).
    expect(Object.keys(upsert.mock.calls[0][0])).toEqual(['consent'])
  })

  it('turning OFF upserts consent=false — and NEVER calls .delete()', async () => {
    const upsert = vi.fn().mockReturnValue(builder({ error: null }))
    const del = vi.fn().mockReturnValue(builder({ error: null }))
    from.mockReturnValue({ upsert, delete: del })
    const { result } = renderHook(() => useSetConsent(), { wrapper: makeWrapper() })

    await result.current.mutateAsync(false)

    expect(upsert).toHaveBeenCalledWith({ consent: false }, { onConflict: 'user_id' })
    expect(del).not.toHaveBeenCalled() // off = consent=false, not a row delete (0029)
  })

  it('surfaces a write error so the caller can revert the switch and tell the user', async () => {
    from.mockReturnValue({ upsert: () => builder({ error: { message: 'nope' } }) })
    const { result } = renderHook(() => useSetConsent(), { wrapper: makeWrapper() })
    await expect(result.current.mutateAsync(true)).rejects.toBeTruthy()
  })
})
