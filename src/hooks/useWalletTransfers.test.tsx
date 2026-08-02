// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// งานที่ 3 — a transfer must NEVER leak into the transactions pipeline that feeds
// หน้าแรก / safeToSpend / งบ / donut / กำไรร้าน / ประวัติ. The structural guarantee
// is: creating a transfer touches only the wallet_transfer_create RPC (0028) and
// invalidates only ['wallets'] — it never writes public.transactions and never
// invalidates ['transactions']. These tests spy on supabase + the query client to
// prove exactly that, so a future edit that "just also records a transaction"
// trips a red test instead of silently inflating every headline.
const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
const from = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) },
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))

import {
  useCreateWalletTransfer,
  useDeleteWalletTransfer,
  useWalletTransfers,
  WALLET_TRANSFER_CAP,
} from '@/hooks/useSettings'

/** A supabase query builder whose terminal call resolves to `result`. Every
 *  chain method returns the same thenable, so .select().order().order().limit()
 *  and .delete().eq() both work. */
function builder(result: { data?: unknown; error: unknown }) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'limit', 'delete', 'eq']) b[m] = () => b
  ;(b as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return b
}

let qc: QueryClient
function makeWrapper() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

afterEach(() => {
  rpc.mockClear().mockResolvedValue({ data: null, error: null })
  from.mockReset()
})

describe('useCreateWalletTransfer — stays out of the transactions pipeline', () => {
  it('calls the wallet_transfer_create RPC and NEVER touches transactions', async () => {
    const { result } = renderHook(() => useCreateWalletTransfer(), { wrapper: makeWrapper() })
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    await result.current.mutateAsync({
      from: 'w1',
      to: 'w2',
      amount: 2000,
      date: '2026-08-02',
      note: '  กดเงินสด  ',
    })

    // the ONLY write path is the RPC.
    expect(rpc).toHaveBeenCalledWith('wallet_transfer_create', {
      p_from: 'w1',
      p_to: 'w2',
      p_amount: 2000,
      p_date: '2026-08-02',
      p_note: 'กดเงินสด', // trimmed here, in the hook
    })
    // never writes the transactions table.
    expect(from).not.toHaveBeenCalledWith('transactions')
    // and only the wallet caches are invalidated — nothing on the ledger side.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['wallets'] })
    for (const call of invalidate.mock.calls) {
      expect(JSON.stringify(call[0])).not.toContain('transactions')
    }
  })

  it('omits p_note entirely when the note is blank', async () => {
    const { result } = renderHook(() => useCreateWalletTransfer(), { wrapper: makeWrapper() })
    await result.current.mutateAsync({ from: 'w1', to: 'w2', amount: 50, date: '2026-08-02', note: '   ' })
    expect(rpc).toHaveBeenCalledWith('wallet_transfer_create', {
      p_from: 'w1',
      p_to: 'w2',
      p_amount: 50,
      p_date: '2026-08-02',
    })
  })

  it('surfaces an RPC error instead of swallowing it', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'โอนไปกระเป๋าเดียวกันไม่ได้' } })
    const { result } = renderHook(() => useCreateWalletTransfer(), { wrapper: makeWrapper() })
    await expect(
      result.current.mutateAsync({ from: 'w1', to: 'w1', amount: 5, date: '2026-08-02' }),
    ).rejects.toBeTruthy()
  })
})

describe('useDeleteWalletTransfer — direct row delete (ใบ 6 chose a policy, not an RPC)', () => {
  it('deletes from wallet_transfers and never touches transactions', async () => {
    from.mockReturnValue(builder({ error: null }))
    const { result } = renderHook(() => useDeleteWalletTransfer(), { wrapper: makeWrapper() })
    await result.current.mutateAsync('t1')
    expect(from).toHaveBeenCalledWith('wallet_transfers')
    expect(from).not.toHaveBeenCalledWith('transactions')
    expect(rpc).not.toHaveBeenCalled() // no delete RPC — a plain DELETE under RLS
  })
})

describe('useWalletTransfers — row-cap guard', () => {
  it('flags capped when the row cap is hit', async () => {
    const rows = Array.from({ length: WALLET_TRANSFER_CAP }, (_, i) => ({ id: `t${i}` }))
    from.mockReturnValue(builder({ data: rows, error: null }))
    const { result } = renderHook(() => useWalletTransfers(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(result.current.data!.capped).toBe(true)
    expect(result.current.data!.rows).toHaveLength(WALLET_TRANSFER_CAP)
  })

  it('does not flag capped for a short page', async () => {
    from.mockReturnValue(builder({ data: [{ id: 't1' }], error: null }))
    const { result } = renderHook(() => useWalletTransfers(), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(result.current.data!.capped).toBe(false)
  })
})