// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Wallet } from '@/lib/db'

// The sheet drives one mutation (wallet_transfer_create) + a toast. Mock them so
// the tests assert the UI contract — blank amount, distinct-wallet filtering,
// await-then-close, and errors reaching the user — not the network.
const createMutate = vi.fn().mockResolvedValue(undefined)
const toastError = vi.fn()
const toastSuccess = vi.fn()

vi.mock('@/hooks/useSettings', () => ({
  useCreateWalletTransfer: () => ({ mutateAsync: createMutate, isPending: false }),
}))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}))
// A fixed "today" so the future-date guard is deterministic.
vi.mock('@/lib/dates', () => ({ todayISO: () => '2026-08-02' }))

import { WalletTransferSheet } from '@/components/WalletTransferSheet'

const wallet = (id: string, name: string, type: Wallet['type'] = 'cash'): Wallet =>
  ({
    id,
    user_id: 'u',
    name,
    type,
    opening_balance: 0,
    created_at: '',
    updated_at: '',
  }) as Wallet

const WALLETS = [wallet('w1', 'เงินสด'), wallet('w2', 'ธนาคาร', 'bank'), wallet('w3', 'พร้อมเพย์', 'promptpay')]

const amountInput = () => screen.getByLabelText('จำนวนเงิน') as HTMLInputElement
const dateInput = () => screen.getByLabelText('วันที่') as HTMLInputElement
const submitBtn = () => screen.getByRole('button', { name: 'โอน' }) as HTMLButtonElement
const pickFrom = (name: string) =>
  fireEvent.click(within('จากกระเป๋า').getByRole('button', { name }))
const pickTo = (name: string) => fireEvent.click(within('ไปกระเป๋า').getByRole('button', { name }))

// scope chip queries to their section (from/to both list wallet names).
function within(sectionLabel: string) {
  const heading = screen.getByText(sectionLabel)
  const section = heading.parentElement as HTMLElement
  return {
    getByRole: (_role: string, opts: { name: string }) =>
      Array.from(section.querySelectorAll('button')).find(
        (b) => (b.textContent || '').trim() === opts.name,
      ) as HTMLElement,
    queryByText: (name: string) =>
      Array.from(section.querySelectorAll('button')).find(
        (b) => (b.textContent || '').trim() === name,
      ) ?? null,
  }
}

afterEach(() => {
  cleanup()
  createMutate.mockClear().mockResolvedValue(undefined)
  toastError.mockClear()
  toastSuccess.mockClear()
})

describe('WalletTransferSheet — form', () => {
  it('opens with a blank amount (no guessed prefill) and today as the date', () => {
    render(<WalletTransferSheet wallets={WALLETS} onClose={() => {}} />)
    expect(amountInput().value).toBe('')
    expect(dateInput().value).toBe('2026-08-02')
    expect(dateInput().max).toBe('2026-08-02') // future dates blocked in the picker
  })

  it('always shows the typed amount — the sheet takes NO hideBalance, so money can never be masked here', () => {
    render(<WalletTransferSheet wallets={WALLETS} onClose={() => {}} />)
    fireEvent.change(amountInput(), { target: { value: '2000' } })
    expect(amountInput().value).toBe('2000')
    expect(screen.queryByText('฿ ••••')).toBeNull()
  })

  it('excludes the chosen source wallet from the destination options', () => {
    render(<WalletTransferSheet wallets={WALLETS} onClose={() => {}} />)
    pickFrom('เงินสด')
    // ไปกระเป๋า must no longer offer เงินสด (can't send to itself).
    expect(within('ไปกระเป๋า').queryByText('เงินสด')).toBeNull()
    expect(within('ไปกระเป๋า').queryByText('ธนาคาร')).not.toBeNull()
  })

  it('clears the destination if it becomes equal to a newly chosen source', () => {
    render(<WalletTransferSheet wallets={WALLETS} onClose={() => {}} />)
    pickFrom('เงินสด')
    pickTo('ธนาคาร')
    // now pick ธนาคาร as the source → destination (ธนาคาร) must clear, disabling submit.
    pickFrom('ธนาคาร')
    expect(submitBtn().disabled).toBe(true)
  })

  it('keeps every typed character in the amount (no clobber)', () => {
    render(<WalletTransferSheet wallets={WALLETS} onClose={() => {}} />)
    const el = amountInput()
    fireEvent.change(el, { target: { value: '2' } })
    fireEvent.change(el, { target: { value: '20' } })
    fireEvent.change(el, { target: { value: '200' } })
    fireEvent.change(el, { target: { value: '2000' } })
    expect(amountInput().value).toBe('2000')
  })
})

describe('WalletTransferSheet — submit + guards', () => {
  it('awaits the server then closes, sending the right args', async () => {
    const onClose = vi.fn()
    render(<WalletTransferSheet wallets={WALLETS} onClose={onClose} />)
    pickFrom('ธนาคาร')
    pickTo('เงินสด')
    fireEvent.change(amountInput(), { target: { value: '2000' } })
    fireEvent.change(screen.getByLabelText('โน้ต (ไม่บังคับ)'), { target: { value: ' กดเงินสด ' } })
    fireEvent.click(submitBtn())
    await waitFor(() => expect(createMutate).toHaveBeenCalled())
    expect(createMutate).toHaveBeenCalledWith({
      from: 'w2',
      to: 'w1',
      amount: 2000,
      date: '2026-08-02',
      note: ' กดเงินสด ', // trimmed inside the hook, not the sheet
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('blocks an empty / zero amount with a message and does not call the RPC', () => {
    render(<WalletTransferSheet wallets={WALLETS} onClose={() => {}} />)
    pickFrom('ธนาคาร')
    pickTo('เงินสด')
    fireEvent.click(submitBtn()) // amount blank
    expect(createMutate).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('ใส่จำนวนเงินที่มากกว่า 0')
  })

  it('blocks a future date with a message and does not call the RPC', () => {
    render(<WalletTransferSheet wallets={WALLETS} onClose={() => {}} />)
    pickFrom('ธนาคาร')
    pickTo('เงินสด')
    fireEvent.change(amountInput(), { target: { value: '100' } })
    fireEvent.change(dateInput(), { target: { value: '2026-08-03' } }) // tomorrow
    fireEvent.click(submitBtn())
    expect(createMutate).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('วันที่โอนต้องไม่เป็นวันในอนาคต')
  })

  it('surfaces an RPC error to the user and keeps the sheet open', async () => {
    createMutate.mockRejectedValueOnce({ message: 'โอนไปกระเป๋าของผู้ใช้อื่นต้อง raise' })
    const onClose = vi.fn()
    render(<WalletTransferSheet wallets={WALLETS} onClose={onClose} />)
    pickFrom('ธนาคาร')
    pickTo('เงินสด')
    fireEvent.change(amountInput(), { target: { value: '100' } })
    fireEvent.click(submitBtn())
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled() // stays open on failure
  })

  it('omits an empty note (submit succeeds without one)', async () => {
    render(<WalletTransferSheet wallets={WALLETS} onClose={() => {}} />)
    pickFrom('ธนาคาร')
    pickTo('เงินสด')
    fireEvent.change(amountInput(), { target: { value: '100' } })
    fireEvent.click(submitBtn())
    await waitFor(() => expect(createMutate).toHaveBeenCalled())
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'w2', to: 'w1', amount: 100, note: '' }),
    )
  })
})
