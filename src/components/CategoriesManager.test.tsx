// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { Category } from '@/lib/db'

// CategoriesManager is an editor over a handful of hooks. Mock them so the test
// asserts the role UI — a single segmented control (ทั่วไป / เข้าสต็อก / ร้าน)
// that writes both columns in one call, disabled wholesale on system categories,
// with the mandatory "old months move" warning — rather than the network.
const setRoleMutate = vi.fn().mockResolvedValue(undefined)

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
  useSetCategoryRole: () => ({ mutateAsync: setRoleMutate }),
}))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import { CategoriesManager } from '@/components/CategoriesManager'

const roleGroup = (name: string) =>
  within(screen.getByRole('radiogroup', { name: `ประเภทหมวด ${name}` }))

afterEach(() => {
  cleanup()
  setRoleMutate.mockClear()
  categories = []
})

describe('CategoriesManager — role segmented control', () => {
  it('offers 3 roles for an expense category and 2 for an income category', () => {
    categories = [
      cat({ id: 'e1', name: 'อาหาร', kind: 'expense' }),
      cat({ id: 'i1', name: 'เงินเดือน', kind: 'income', icon: 'cash', color_index: 4 }),
    ]
    render(<CategoriesManager onClose={() => {}} />)

    const expense = roleGroup('อาหาร')
    expect(expense.getByRole('radio', { name: 'ทั่วไป' })).toBeTruthy()
    expect(expense.getByRole('radio', { name: 'เข้าสต็อก' })).toBeTruthy()
    expect(expense.getByRole('radio', { name: 'ร้าน' })).toBeTruthy()

    const income = roleGroup('เงินเดือน')
    expect(income.getByRole('radio', { name: 'ทั่วไป' })).toBeTruthy()
    expect(income.getByRole('radio', { name: 'ร้าน' })).toBeTruthy()
    expect(income.queryByRole('radio', { name: 'เข้าสต็อก' })).toBeNull()
  })

  it('marks the current role as checked', () => {
    categories = [cat({ id: 's1', name: 'เสื้อเข้าร้าน', is_stock_category: true })]
    render(<CategoriesManager onClose={() => {}} />)
    const g = roleGroup('เสื้อเข้าร้าน')
    expect(g.getByRole('radio', { name: 'เข้าสต็อก' }).getAttribute('aria-checked')).toBe('true')
    expect(g.getByRole('radio', { name: 'ทั่วไป' }).getAttribute('aria-checked')).toBe('false')
  })

  it('writes both columns when selecting เข้าสต็อก (stock on, shop off)', () => {
    categories = [cat({ id: 'e1', name: 'อาหาร' })]
    render(<CategoriesManager onClose={() => {}} />)
    fireEvent.click(roleGroup('อาหาร').getByRole('radio', { name: 'เข้าสต็อก' }))
    expect(setRoleMutate).toHaveBeenCalledWith({
      id: 'e1',
      is_stock_category: true,
      is_shop_category: false,
    })
  })

  it('writes both columns when selecting ร้าน (stock off, shop on)', () => {
    categories = [cat({ id: 'e1', name: 'อาหาร' })]
    render(<CategoriesManager onClose={() => {}} />)
    fireEvent.click(roleGroup('อาหาร').getByRole('radio', { name: 'ร้าน' }))
    expect(setRoleMutate).toHaveBeenCalledWith({
      id: 'e1',
      is_stock_category: false,
      is_shop_category: true,
    })
  })

  it('clears both columns when selecting ทั่วไป', () => {
    categories = [cat({ id: 'sh1', name: 'ค่าโฆษณา', is_shop_category: true })]
    render(<CategoriesManager onClose={() => {}} />)
    fireEvent.click(roleGroup('ค่าโฆษณา').getByRole('radio', { name: 'ทั่วไป' }))
    expect(setRoleMutate).toHaveBeenCalledWith({
      id: 'sh1',
      is_stock_category: false,
      is_shop_category: false,
    })
  })

  it('switches เข้าสต็อก → ร้าน in one write — never (true, true)', () => {
    categories = [cat({ id: 's1', name: 'เสื้อเข้าร้าน', is_stock_category: true })]
    render(<CategoriesManager onClose={() => {}} />)
    fireEvent.click(roleGroup('เสื้อเข้าร้าน').getByRole('radio', { name: 'ร้าน' }))
    expect(setRoleMutate).toHaveBeenCalledTimes(1)
    expect(setRoleMutate).toHaveBeenCalledWith({
      id: 's1',
      is_stock_category: false,
      is_shop_category: true,
    })
  })

  it('does not write when re-tapping the current role', () => {
    categories = [cat({ id: 'e1', name: 'อาหาร' })]
    render(<CategoriesManager onClose={() => {}} />)
    fireEvent.click(roleGroup('อาหาร').getByRole('radio', { name: 'ทั่วไป' }))
    expect(setRoleMutate).not.toHaveBeenCalled()
  })

  it('disables the whole control AND hides the delete button on a system category', () => {
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
    const g = roleGroup('ขายสต็อก')
    expect((g.getByRole('radio', { name: 'ทั่วไป' }) as HTMLButtonElement).disabled).toBe(true)
    expect((g.getByRole('radio', { name: 'ร้าน' }) as HTMLButtonElement).disabled).toBe(true)
    // no delete button on a system category — edit stays
    expect(screen.queryByRole('button', { name: 'ลบ' })).toBeNull()
    expect(screen.getByRole('button', { name: 'แก้ไข' })).toBeTruthy()
  })

  it('shows the "past months move" warning for the ร้าน role only', () => {
    categories = [cat({ id: 'sh1', name: 'ค่าโฆษณา', is_shop_category: true })]
    render(<CategoriesManager onClose={() => {}} />)
    // the mandatory phrase — the only thing telling the user this role rewrites history (§3.2)
    expect(screen.getByText(/ตัวเลขของเดือนก่อน ๆ จะขยับตาม/)).toBeTruthy()
  })

  it('does not show the history-rewrite warning for a plain ทั่วไป category', () => {
    categories = [cat({ id: 'e1', name: 'อาหาร' })]
    render(<CategoriesManager onClose={() => {}} />)
    expect(screen.queryByText(/ตัวเลขของเดือนก่อน ๆ จะขยับตาม/)).toBeNull()
  })
})
