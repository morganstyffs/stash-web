// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { EditableTx } from '@/hooks/useTransactions'

// This guards the [tx?.id] dep on the form-seeding effect (see App.tsx: with
// refetch-on-focus ON, TanStack hands back a *new* object whenever the row is
// refetched). If the effect were keyed on the object instead of the id, a
// background refetch of an unchanged row would re-run it and clobber whatever
// the user had typed but not yet saved. A jsdom test is fine here: we assert on
// the input's own `.value`, which is real component state, not a layout claim.

// Mutable holder so a rerender can feed a fresh object with the same id/values —
// exactly what a refetch of an unchanged server row produces.
let currentTx: EditableTx

vi.mock('@/hooks/useTransactions', () => ({
  useTransaction: () => ({ data: currentTx }),
  useUpdateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useLookups', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/hooks/useSettings', () => ({ useWallets: () => ({ data: [] }) }))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import { TransactionEditSheet } from '@/components/TransactionEditSheet'

const row = (): EditableTx => ({
  id: 'tx-1',
  type: 'expense',
  amount: 100,
  category_id: 'cat-1',
  wallet_id: 'w-1',
  date: '2026-07-31',
  note: null,
  created_at: '2026-07-31T03:00:00+00:00',
  is_stock_purchase: false,
  is_stock_cogs: false,
  is_debt_settlement: false,
  stock_item_id: null,
})

afterEach(cleanup)

describe('TransactionEditSheet — refetch-on-focus safety', () => {
  it('keeps a typed amount when the query returns a new object with the same id', () => {
    currentTx = row()
    const { rerender } = render(<TransactionEditSheet id="tx-1" onClose={() => {}} />)

    // amount is the first text input in the sheet (note is the second)
    const amount = () => screen.getAllByRole('textbox')[0] as HTMLInputElement
    fireEvent.change(amount(), { target: { value: '250' } })
    expect(amount().value).toBe('250')

    // simulate refetch-on-focus: a new object, same id, identical field values
    currentTx = row()
    rerender(<TransactionEditSheet id="tx-1" onClose={() => {}} />)

    expect(amount().value).toBe('250')
  })
})
