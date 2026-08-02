// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Category, StockItem } from '@/lib/db'

// The post-sale shipping nudge: after a sale lands, StockEditSheet asks whether
// the buyer also paid a delivery fee (so the wallet total matches what was
// transferred), but only when there's a shop income category to book it into.
// These render tests drive the real sell → nudge → navigate path.

let navigateMock: ReturnType<typeof vi.fn>
let sellMock: ReturnType<typeof vi.fn>
let onCloseMock: ReturnType<typeof vi.fn>
// Mutable so each test can control which categories exist (drives whether the
// nudge shows and whether it preselects).
let categoriesData: Category[]

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/useQueue', () => ({
  useUpdateStockItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useStock', () => ({
  useDeleteStockItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useSettings', () => ({ useWallets: () => ({ data: [] }) }))
vi.mock('@/hooks/useLookups', () => ({ useCategories: () => ({ data: categoriesData }) }))
vi.mock('@/hooks/useStockSale', () => ({
  useCreateStockSale: () => ({ mutateAsync: sellMock, isPending: false }),
  useReverseStockSale: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useStockSales', () => ({ useItemSales: () => ({ data: [] }) }))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}))
vi.mock('@/lib/storage', () => ({
  signStockPhotos: () => Promise.resolve({}),
  uploadStockPhotos: vi.fn(),
}))

import { StockEditSheet } from '@/components/StockEditSheet'

const cat = (over: Partial<Category>): Category => ({
  id: 'c1',
  user_id: 'u1',
  name: 'ค่าส่งที่เก็บจากลูกค้า',
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

const item: StockItem = {
  id: 'it1',
  user_id: 'u1',
  name: 'เสื้อยืด',
  brand: null,
  category: null,
  color: null,
  size: null,
  condition: null,
  cost_per_unit: 100,
  target_price: 500,
  photos: [],
  qty_remaining: 3,
  qty_total: 3,
  sku: 'STZ-0001',
  source_transaction_id: null,
  status: 'in_stock',
  needs_details: false,
  created_at: '',
  updated_at: '',
}

// Open the sell panel and confirm a sale of 1 @ ฿500.
async function sellOne() {
  fireEvent.click(screen.getByRole('button', { name: /ขายสินค้า/ }))
  // The sell price field is the first placeholder="0" input (before the edit
  // ราคาตั้งขาย field further down).
  const price = screen.getAllByPlaceholderText('0')[0]
  fireEvent.change(price, { target: { value: '500' } })
  fireEvent.click(screen.getByRole('button', { name: 'ขาย' }))
}

const NUDGE = 'ลูกค้าจ่ายค่าส่งมาด้วยไหม?'

beforeEach(() => {
  navigateMock = vi.fn()
  sellMock = vi.fn().mockResolvedValue(undefined)
  onCloseMock = vi.fn()
  categoriesData = [cat({ id: 'ship' })]
})
afterEach(cleanup)

describe('StockEditSheet — post-sale shipping nudge', () => {
  it('shows the nudge after a successful sale when a shop income category exists', async () => {
    render(<StockEditSheet item={item} hasSales={false} onClose={onCloseMock} />)
    await sellOne()
    expect(await screen.findByText(NUDGE)).toBeTruthy()
    // the sale itself was recorded and the sheet did NOT close yet
    expect(sellMock).toHaveBeenCalledOnce()
    expect(onCloseMock).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('does NOT show the nudge when there is no shop income category — closes as before', async () => {
    categoriesData = [cat({ id: 'exp', kind: 'expense' }), cat({ id: 'plain', is_shop_category: false })]
    render(<StockEditSheet item={item} hasSales={false} onClose={onCloseMock} />)
    await sellOne()
    await waitFor(() => expect(onCloseMock).toHaveBeenCalledOnce())
    expect(screen.queryByText(NUDGE)).toBeNull()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('“ไม่มี” closes the sheet without navigating', async () => {
    render(<StockEditSheet item={item} hasSales={false} onClose={onCloseMock} />)
    await sellOne()
    await screen.findByText(NUDGE)
    fireEvent.click(screen.getByRole('button', { name: 'ไม่มี' }))
    expect(onCloseMock).toHaveBeenCalledOnce()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('“บันทึกค่าส่ง” navigates to /add with income + the single shop category preselected', async () => {
    render(<StockEditSheet item={item} hasSales={false} onClose={onCloseMock} />)
    await sellOne()
    await screen.findByText(NUDGE)
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกค่าส่ง' }))
    expect(navigateMock).toHaveBeenCalledWith('/add', {
      state: {
        prefill: { type: 'income', categoryId: 'ship' },
        returnTo: '/stock',
      },
    })
  })

  it('does NOT preselect a category when several shop income categories exist (ambiguous)', async () => {
    categoriesData = [cat({ id: 'ship-1' }), cat({ id: 'ship-2' })]
    render(<StockEditSheet item={item} hasSales={false} onClose={onCloseMock} />)
    await sellOne()
    await screen.findByText(NUDGE)
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกค่าส่ง' }))
    expect(navigateMock).toHaveBeenCalledWith('/add', {
      state: {
        prefill: { type: 'income' },
        returnTo: '/stock',
      },
    })
  })
})
