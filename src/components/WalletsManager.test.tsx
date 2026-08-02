// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Wallet, WalletBalance } from '@/lib/db'

// WalletsManager is an editor over a few hooks. Mock them so the tests assert the
// UI contract — the balance shown is the RPC's own `balance` (never recomputed),
// masking/negative/loading/error behaviour, and the opening-balance form — rather
// than the network.
const upsertMutate = vi.fn().mockResolvedValue(undefined)
const deleteMutate = vi.fn().mockResolvedValue(undefined)

const wallet = (over: Partial<Wallet>): Wallet =>
  ({
    id: 'w',
    user_id: 'u',
    name: 'เงินสด',
    type: 'cash',
    opening_balance: 0,
    created_at: '',
    updated_at: '',
    ...over,
  }) as Wallet

const bal = (over: Partial<WalletBalance>): WalletBalance => ({
  wallet_id: 'w',
  opening_balance: 0,
  income_total: 0,
  expense_total: 0,
  transfer_in: 0,
  transfer_out: 0,
  balance: 0,
  ...over,
})

let wallets: Wallet[] = []
let balancesReturn: { data: WalletBalance[] | undefined; isError: boolean; error: unknown } = {
  data: [],
  isError: false,
  error: null,
}
let hideBalance = false

vi.mock('@/hooks/useSettings', () => ({
  useWallets: () => ({ data: wallets }),
  useWalletBalances: () => balancesReturn,
  useUpsertWallet: () => ({ mutateAsync: upsertMutate, isPending: false }),
  useDeleteWallet: () => ({ mutateAsync: deleteMutate, isPending: false }),
}))
vi.mock('@/hooks/useHideBalance', () => ({
  useHideBalance: () => ({ hideBalance, toggleHideBalance: () => {} }),
}))
vi.mock('@/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

import { WalletsManager } from '@/components/WalletsManager'

const openCreate = () => fireEvent.click(screen.getByRole('button', { name: 'เพิ่มกระเป๋า' }))
const openEdit = () => fireEvent.click(screen.getByRole('button', { name: 'แก้ไข' }))
const openingInput = () => screen.getByLabelText('เงินที่มีอยู่ในกระเป๋านี้ตอนเริ่มใช้แอป')

afterEach(() => {
  cleanup()
  upsertMutate.mockClear()
  deleteMutate.mockClear()
  wallets = []
  balancesReturn = { data: [], isError: false, error: null }
  hideBalance = false
})

describe('WalletsManager — balance display comes straight from the RPC', () => {
  it('shows the RPC `balance` field verbatim, NOT opening+income−expense', () => {
    // balance (9,999) deliberately does NOT equal opening+income−expense (1,234):
    // if the row is showing a client recomputation this assert fails.
    wallets = [wallet({ id: 'w1', name: 'เงินสด' })]
    balancesReturn = {
      data: [bal({ wallet_id: 'w1', opening_balance: 1000, income_total: 500, expense_total: 266, balance: 9999 })],
      isError: false,
      error: null,
    }
    render(<WalletsManager onClose={() => {}} />)
    // shown on the row (and, single wallet, the total) — never the recomputed 1,234.
    expect(screen.getAllByText('฿9,999').length).toBeGreaterThan(0)
    expect(screen.queryByText('฿1,234')).toBeNull()
  })

  it('sums the authoritative per-wallet balances for the total', () => {
    wallets = [wallet({ id: 'w1', name: 'เงินสด' }), wallet({ id: 'w2', name: 'ธนาคาร', type: 'bank' })]
    balancesReturn = {
      data: [bal({ wallet_id: 'w1', balance: 1000 }), bal({ wallet_id: 'w2', balance: 250 })],
      isError: false,
      error: null,
    }
    render(<WalletsManager onClose={() => {}} />)
    // 1000 + 250 = 1,250 shown against the "เงินในกระเป๋าทั้งหมด" line.
    expect(screen.getByText('฿1,250')).toBeTruthy()
  })

  it('reveals the RPC components (opening / income / expense / transfers) on tap', () => {
    wallets = [wallet({ id: 'w1', name: 'เงินสด' })]
    balancesReturn = {
      data: [
        bal({
          wallet_id: 'w1',
          opening_balance: 1000,
          income_total: 500,
          expense_total: 200,
          transfer_in: 30,
          transfer_out: 10,
          balance: 1320,
        }),
      ],
      isError: false,
      error: null,
    }
    render(<WalletsManager onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'ที่มาของยอดคงเหลือ เงินสด' }))
    expect(screen.getByText('ยอดตั้งต้น')).toBeTruthy()
    expect(screen.getByText('+฿500')).toBeTruthy()
    expect(screen.getByText('−฿200')).toBeTruthy()
    expect(screen.getByText('+฿30')).toBeTruthy() // โอนเข้า shows once there's a transfer
    expect(screen.getByText('−฿10')).toBeTruthy()
  })

  it('hides the transfer lines when the wallet has never transferred', () => {
    wallets = [wallet({ id: 'w1', name: 'เงินสด' })]
    balancesReturn = {
      data: [bal({ wallet_id: 'w1', opening_balance: 1000, balance: 1000 })],
      isError: false,
      error: null,
    }
    render(<WalletsManager onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'ที่มาของยอดคงเหลือ เงินสด' }))
    expect(screen.queryByText('โอนเข้า')).toBeNull()
    expect(screen.queryByText('โอนออก')).toBeNull()
  })
})

describe('WalletsManager — masking, negatives, loading, errors', () => {
  it('masks every figure when ซ่อนยอดเงิน is on', () => {
    hideBalance = true
    wallets = [wallet({ id: 'w1', name: 'เงินสด' })]
    balancesReturn = {
      data: [bal({ wallet_id: 'w1', opening_balance: 1000, income_total: 500, balance: 1500 })],
      isError: false,
      error: null,
    }
    render(<WalletsManager onClose={() => {}} />)
    // no real figure anywhere (row + total), only the mask.
    expect(screen.queryByText('฿1,500')).toBeNull()
    expect(screen.getAllByText('฿ ••••').length).toBeGreaterThan(0)
    // even the breakdown masks.
    fireEvent.click(screen.getByRole('button', { name: 'ที่มาของยอดคงเหลือ เงินสด' }))
    expect(screen.queryByText('+฿500')).toBeNull()
  })

  it('shows a negative balance as negative — never clamped to ฿0', () => {
    wallets = [wallet({ id: 'w1', name: 'เงินสด' })]
    balancesReturn = {
      data: [bal({ wallet_id: 'w1', opening_balance: 100, expense_total: 600, balance: -500 })],
      isError: false,
      error: null,
    }
    render(<WalletsManager onClose={() => {}} />)
    const negs = screen.getAllByText('−฿500') // the row (and, single wallet, the total)
    expect(negs.length).toBeGreaterThan(0)
    // every place the negative shows carries the expense colour, none clamped to ฿0.
    for (const n of negs) expect(n.className).toContain('text-expense')
    expect(screen.queryByText('฿0')).toBeNull()
  })

  it('shows a pending placeholder, not a fake ฿0, while balances load', () => {
    wallets = [wallet({ id: 'w1', name: 'เงินสด' })]
    balancesReturn = { data: undefined, isError: false, error: null }
    render(<WalletsManager onClose={() => {}} />)
    expect(screen.queryByText('฿0')).toBeNull()
    expect(screen.getAllByText('…').length).toBeGreaterThan(0)
  })

  it('surfaces a balance-load error to the user and never reads as ฿0', () => {
    wallets = [wallet({ id: 'w1', name: 'เงินสด' })]
    balancesReturn = { data: undefined, isError: true, error: { message: 'boom' } }
    render(<WalletsManager onClose={() => {}} />)
    expect(screen.getByText(/โหลดยอดคงเหลือไม่สำเร็จ/)).toBeTruthy()
    expect(screen.queryByText('฿0')).toBeNull()
  })
})

describe('WalletsManager — opening-balance form', () => {
  it('opens blank on create (no guessed prefill)', () => {
    render(<WalletsManager onClose={() => {}} />)
    openCreate()
    expect((openingInput() as HTMLInputElement).value).toBe('')
  })

  it('keeps every typed character (no clobber) and saves the parsed number', async () => {
    render(<WalletsManager onClose={() => {}} />)
    openCreate()
    fireEvent.change(screen.getByPlaceholderText('ชื่อกระเป๋า'), { target: { value: 'ออมสิน' } })
    // type several characters in a row — the value must accumulate, not drop.
    const input = openingInput() as HTMLInputElement
    fireEvent.change(input, { target: { value: '1' } })
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.change(input, { target: { value: '125' } })
    fireEvent.change(input, { target: { value: '1250' } })
    expect((openingInput() as HTMLInputElement).value).toBe('1250')
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(upsertMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ออมสิน', type: 'cash', opening_balance: 1250 }),
    )
  })

  it('a typed value survives a background refetch re-render (form state is not query-seeded)', () => {
    wallets = [wallet({ id: 'w1', name: 'เงินสด', opening_balance: 0 })]
    balancesReturn = { data: [bal({ wallet_id: 'w1' })], isError: false, error: null }
    const view = render(<WalletsManager onClose={() => {}} />)
    openEdit()
    const input = openingInput() as HTMLInputElement
    fireEvent.change(input, { target: { value: '999' } })
    // simulate refetchOnWindowFocus handing back a fresh wallet object.
    wallets = [wallet({ id: 'w1', name: 'เงินสด', opening_balance: 0 })]
    view.rerender(<WalletsManager onClose={() => {}} />)
    expect((openingInput() as HTMLInputElement).value).toBe('999')
  })

  it('blank saves as 0', async () => {
    render(<WalletsManager onClose={() => {}} />)
    openCreate()
    fireEvent.change(screen.getByPlaceholderText('ชื่อกระเป๋า'), { target: { value: 'ซอง' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(upsertMutate).toHaveBeenCalledWith(expect.objectContaining({ opening_balance: 0 }))
  })

  it('edit seeds the stored opening balance (so saving name/type never wipes it)', () => {
    wallets = [wallet({ id: 'w1', name: 'ธนาคาร', type: 'bank', opening_balance: 5000 })]
    balancesReturn = { data: [bal({ wallet_id: 'w1', opening_balance: 5000, balance: 5000 })], isError: false, error: null }
    render(<WalletsManager onClose={() => {}} />)
    openEdit()
    expect((openingInput() as HTMLInputElement).value).toBe('5000')
  })

  it('strips non-numeric characters (letters, a minus, a second dot)', () => {
    render(<WalletsManager onClose={() => {}} />)
    openCreate()
    const input = openingInput() as HTMLInputElement
    fireEvent.change(input, { target: { value: '-1a2.3.4' } })
    expect((openingInput() as HTMLInputElement).value).toBe('12.34')
  })
})

describe('WalletsManager — list', () => {
  it('renders one edit + one delete per wallet', () => {
    wallets = [wallet({ id: 'w1', name: 'เงินสด' }), wallet({ id: 'w2', name: 'ธนาคาร', type: 'bank' })]
    balancesReturn = { data: [bal({ wallet_id: 'w1' }), bal({ wallet_id: 'w2' })], isError: false, error: null }
    render(<WalletsManager onClose={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'แก้ไข' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'ลบ' })).toHaveLength(2)
  })

  it('does not render the total line when there are no wallets', () => {
    wallets = []
    render(<WalletsManager onClose={() => {}} />)
    expect(screen.queryByText('เงินในกระเป๋าทั้งหมด')).toBeNull()
  })
})
