// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// The intake screen renders `useSkuPreview().data` verbatim (StockIntakePage) —
// there is deliberately NO SKU-assembly logic in the client (sku.ts exports only
// prefix helpers). This proves the preview value ORIGINATES from the RPC: the
// hook returns exactly what stock_sku_preview() yields, and it calls that RPC
// with no arguments (the brand is no longer part of the SKU — 0025).
const rpc = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))

import { useSkuPreview } from '@/hooks/useSku'

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useSkuPreview — the preview comes from the RPC, not client assembly', () => {
  it('returns exactly what stock_sku_preview() yields, called with no args', async () => {
    rpc.mockResolvedValue({ data: 'ABC-0042', error: null })

    const { result } = renderHook(() => useSkuPreview(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.data).toBe('ABC-0042'))
    expect(rpc).toHaveBeenCalledWith('stock_sku_preview')
    expect(rpc.mock.calls[0]).toHaveLength(1) // argless — no brand passed
  })

  it('surfaces an RPC error instead of swallowing it', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const { result } = renderHook(() => useSkuPreview(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
