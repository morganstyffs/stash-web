// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Category } from '@/lib/db'

// CategoriesManager is an editor over a handful of hooks. Mock them so the test
// asserts the shop-flag UI (toggle visible for both kinds, disabled on system /
// stock categories to mirror the DB CHECK, and the mandatory "old months move"
// warning) rather than the network.
const shopMutate = vi.fn().mockResolvedValue(undefined)

const cat = (over: Partial<Category>): Category =>
  ({
    id: 'c',
    user_id: 'u',
    name: 'หมวด',
    kind: 'expense',
    is_stock_category: false,
    is_shop_category: false,
    is_system: false,
    system_key: null,
    icon: 'tag',
    color_index: 1,
    created_at: '',
    updated_at: '',
    ...over,
  }) as Category

let categories: Category[] = []

vi.mock('@/hooks/useLookups', () => ({ useCategories: () => ({ data: categories }) }))
vi.mock('@/hooks/useSettings', () => ({
  useUpsertCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useToggleStockCategory: () => ({ mutate: vi.fn() }),
  useToggleShopCategory: () => ({ mutateAsync: shopMutate }),
}))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import { CategoriesManager } from '@/components/CategoriesManager'

const shopToggle = (name: string) =>
  screen.getByRole('switch', { name: `หมวดร้าน ${name}` }) as HTMLButtonElement

afterEach(() => {
  cleanup()
  shopMutate.mockClear()
  categories = []
})

describe('CategoriesManager — shop-category (ร้าน) flag', () => {
  it('offers the ร้าน toggle for BOTH an expense and an income category', () => {
    categories = [
      cat({ id: 'e1', name: 'อาหาร', kind: 'expense' }),
      cat({ id: 'i1', name: 'เงินเดือน', kind: 'income', icon: 'cash', color_index: 4 }),
    ]
    render(<CategoriesManager onClose={() => {}} />)
    expect(shopToggle('อาหาร').disabled).toBe(false)
    expect(shopToggle('เงินเดือน').disabled).toBe(false)
  })

  it('disables the ร้าน toggle on a system category (mirrors the DB CHECK)', () => {
    categories = [
      cat({
        id: 'sys',
        name: 'ขายสต็อก',
        kind: 'income',
        is_system: true,
        system_key: 'stock_sale_income',
        icon: 'box',
        color_index: 6,
      }),
    ]
    render(<CategoriesManager onClose={() => {}} />)
    expect(shopToggle('ขายสต็อก').disabled).toBe(true)
  })

  it('disables the ร้าน toggle on a stock-intake category (mutually exclusive)', () => {
    categories = [
      cat({ id: 's1', name: 'เสื้อเข้าร้าน', kind: 'expense', is_stock_category: true, icon: 'shirt', color_index: 6 }),
    ]
    render(<CategoriesManager onClose={() => {}} />)
    expect(shopToggle('เสื้อเข้าร้าน').disabled).toBe(true)
  })

  it('shows the mandatory warning that changing the flag moves past-month figures', () => {
    categories = [cat({ id: 'e1', name: 'อาหาร' })]
    render(<CategoriesManager onClose={() => {}} />)
    // the eyebrow phrase that must never be dropped (§3.2)
    expect(screen.getByText(/เดือนก่อน/)).toBeTruthy()
  })

  it('flips the flag through useToggleShopCategory when tapped', () => {
    categories = [cat({ id: 'e1', name: 'อาหาร' })]
    render(<CategoriesManager onClose={() => {}} />)
    fireEvent.click(shopToggle('อาหาร'))
    expect(shopMutate).toHaveBeenCalledWith({ id: 'e1', value: true })
  })
})
