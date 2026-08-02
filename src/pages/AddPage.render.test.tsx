// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Category } from '@/lib/db'

// Render tests for the two prefill additions AddPage grew for the post-sale
// shipping flow: preselecting a passed categoryId (only when it's actually
// selectable) WITHOUT prefilling an amount, and honouring a returnTo on both the
// back button and a successful save.

let navigateMock: ReturnType<typeof vi.fn>
let addMock: ReturnType<typeof vi.fn>
// The history state this render sees (prefill + returnTo). Set per test.
let locationState: unknown

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ state: locationState }),
}))
vi.mock('@/hooks/useLookups', () => ({
  useCategories: () => ({ data: categoriesData }),
  useFavorites: () => ({ data: [] }),
  useUpsertFavorite: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useAddTransaction', () => ({
  useAddTransaction: () => ({ mutateAsync: addMock, isPending: false, error: null }),
}))
vi.mock('@/hooks/useTransactions', () => ({
  useDeleteTransaction: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/useEntryHints', () => ({ useEntryHints: () => ({ data: [] }) }))
vi.mock('@/hooks/useSettings', () => ({ useWallets: () => ({ data: [] }) }))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}))
vi.mock('@/components/CategoriesManager', () => ({ CategoriesManager: () => null }))
vi.mock('@/components/FavoritesManager', () => ({ FavoritesManager: () => null }))

import { AddPage } from '@/pages/AddPage'

const cat = (over: Partial<Category>): Category => ({
  id: 'c1',
  user_id: 'u1',
  name: 'หมวด',
  kind: 'income',
  icon: 'tag',
  color_index: 0,
  sort_order: 0,
  is_shop_category: true,
  is_stock_category: false,
  is_system: false,
  system_key: null,
  created_at: '',
  updated_at: '',
  ...over,
})

// One selectable income category ("ค่าส่ง") and one plain expense one.
let categoriesData: Category[]

const SHIP = 'ค่าส่งที่เก็บจากลูกค้า'

beforeEach(() => {
  navigateMock = vi.fn()
  addMock = vi.fn().mockResolvedValue({ id: 'r1' })
  locationState = null
  categoriesData = [
    cat({ id: 'ship', kind: 'income', name: SHIP }),
    cat({ id: 'food', kind: 'expense', name: 'อาหาร', is_shop_category: false }),
  ]
})
afterEach(cleanup)

describe('AddPage — prefill.categoryId', () => {
  it('preselects a passed categoryId that is selectable, WITHOUT prefilling an amount', async () => {
    locationState = { prefill: { type: 'income', categoryId: 'ship' } }
    render(<AddPage />)

    const chip = await screen.findByRole('button', { name: SHIP })
    await waitFor(() => expect(chip.getAttribute('aria-pressed')).toBe('true'))

    // amount stayed empty → save is blocked ONLY on the amount (category is set)
    expect(screen.getByText('ใส่จำนวนเงิน')).toBeTruthy()
    // the amount live-region reads zero, i.e. the field is empty
    expect(screen.getByText('0.00 บาท')).toBeTruthy()
  })

  it('ignores a categoryId that is not in the selectable list, and the page still renders', async () => {
    locationState = { prefill: { type: 'income', categoryId: 'deleted-cat' } }
    render(<AddPage />)

    const chip = await screen.findByRole('button', { name: SHIP })
    // nothing got selected — the stale id was dropped, no chip is active
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    // both amount and category are still missing
    expect(screen.getByText('ใส่จำนวนเงิน และเลือกหมวด')).toBeTruthy()
  })
})

describe('AddPage — returnTo', () => {
  it('back button returns to returnTo when present', () => {
    locationState = { prefill: { type: 'income' }, returnTo: '/stock' }
    render(<AddPage />)
    fireEvent.click(screen.getByRole('button', { name: 'ย้อนกลับ' }))
    expect(navigateMock).toHaveBeenCalledWith('/stock')
  })

  it('back button falls back to / when there is no returnTo', () => {
    locationState = null
    render(<AddPage />)
    fireEvent.click(screen.getByRole('button', { name: 'ย้อนกลับ' }))
    expect(navigateMock).toHaveBeenCalledWith('/')
  })

  it('rejects an external returnTo and falls back to / (no open redirect)', () => {
    locationState = { returnTo: 'https://evil.example' }
    render(<AddPage />)
    fireEvent.click(screen.getByRole('button', { name: 'ย้อนกลับ' }))
    expect(navigateMock).toHaveBeenCalledWith('/')
  })

  it('navigates to returnTo after a successful save', async () => {
    locationState = { prefill: { type: 'income', categoryId: 'ship' }, returnTo: '/stock' }
    render(<AddPage />)

    // wait for the category to preselect, then key an amount
    const chip = await screen.findByRole('button', { name: SHIP })
    await waitFor(() => expect(chip.getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    fireEvent.click(screen.getByRole('button', { name: '0' }))
    fireEvent.click(screen.getByRole('button', { name: '0' }))

    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/stock'))
    expect(addMock).toHaveBeenCalledOnce()
  })

  it('stays on the page after save when there is no returnTo (form clears, no navigate)', async () => {
    locationState = { prefill: { type: 'income', categoryId: 'ship' } }
    render(<AddPage />)

    const chip = await screen.findByRole('button', { name: SHIP })
    await waitFor(() => expect(chip.getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    fireEvent.click(screen.getByRole('button', { name: '0' }))
    fireEvent.click(screen.getByRole('button', { name: '0' }))

    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
    await waitFor(() => expect(addMock).toHaveBeenCalledOnce())
    // no navigation away, and the amount cleared back to zero
    expect(navigateMock).not.toHaveBeenCalled()
    expect(screen.getByText('0.00 บาท')).toBeTruthy()
  })
})
