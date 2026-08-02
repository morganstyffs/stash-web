// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { Category } from '@/lib/db'

// CategoriesManager is an editor over a handful of hooks. Mock them so the tests
// assert the UI contract — a single row per category with a role badge, and the
// role picker living inside the create/edit sheet (ส่วนตัว / เติมสต็อก / ของร้าน),
// writing both columns in one useSetCategoryRole call — rather than the network.
const setRoleMutate = vi.fn().mockResolvedValue(undefined)
const upsertMutate = vi.fn().mockResolvedValue(undefined)

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
  useUpsertCategory: () => ({ mutateAsync: upsertMutate, isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetCategoryRole: () => ({ mutateAsync: setRoleMutate }),
}))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

import { CategoriesManager } from '@/components/CategoriesManager'

/** The single role picker in the open sheet. */
const rolePicker = () =>
  within(screen.getByRole('radiogroup', { name: 'บทบาทของหมวด' }))

/** Open the edit sheet for the (single) category on screen. */
const openEdit = () => fireEvent.click(screen.getByRole('button', { name: 'แก้ไข' }))
/** Open the create sheet. */
const openCreate = () => fireEvent.click(screen.getByRole('button', { name: 'เพิ่มหมวด' }))

afterEach(() => {
  cleanup()
  setRoleMutate.mockClear()
  upsertMutate.mockClear()
  categories = []
})

describe('CategoriesManager — list rows', () => {
  it('renders exactly one row per category (no per-row role control in the list)', () => {
    categories = [
      cat({ id: 'e1', name: 'อาหาร' }),
      cat({ id: 'e2', name: 'เดินทาง' }),
    ]
    render(<CategoriesManager onClose={() => {}} />)
    // No sheet open → no role picker anywhere in the list.
    expect(screen.queryByRole('radiogroup', { name: 'บทบาทของหมวด' })).toBeNull()
    // One edit button per category.
    expect(screen.getAllByRole('button', { name: 'แก้ไข' })).toHaveLength(2)
  })

  it('badges only non-ส่วนตัว categories, and marks system ones', () => {
    categories = [cat({ id: 'g', name: 'อาหาร' })]
    const { unmount } = render(<CategoriesManager onClose={() => {}} />)
    // A plain ส่วนตัว category carries no role badge (keeps the list clean).
    expect(screen.queryByText('ส่วนตัว')).toBeNull()
    expect(screen.queryByText('เติมสต็อก')).toBeNull()
    expect(screen.queryByText('ของร้าน')).toBeNull()
    unmount()

    categories = [cat({ id: 's', name: 'เสื้อเข้าร้าน', is_stock_category: true })]
    const r2 = render(<CategoriesManager onClose={() => {}} />)
    expect(screen.getByText('เติมสต็อก')).toBeTruthy()
    r2.unmount()

    categories = [cat({ id: 'sh', name: 'ค่าส่ง', is_shop_category: true })]
    const r3 = render(<CategoriesManager onClose={() => {}} />)
    expect(screen.getByText('ของร้าน')).toBeTruthy()
    r3.unmount()

    categories = [
      cat({ id: 'sys', name: 'ขายสต็อก', kind: 'income', is_system: true, system_key: 'stock_sale_income' }),
    ]
    render(<CategoriesManager onClose={() => {}} />)
    expect(screen.getByText('ระบบ')).toBeTruthy()
  })

  it('hides the delete button on a system category (edit stays)', () => {
    categories = [
      cat({ id: 'sys', name: 'ขายสต็อก', kind: 'income', is_system: true, system_key: 'stock_sale_income' }),
    ]
    render(<CategoriesManager onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'ลบ' })).toBeNull()
    expect(screen.getByRole('button', { name: 'แก้ไข' })).toBeTruthy()
  })
})

describe('CategoriesManager — role picker in the edit sheet', () => {
  it('offers 3 roles for an expense category and 2 for an income category', () => {
    categories = [cat({ id: 'e1', name: 'อาหาร', kind: 'expense' })]
    const r1 = render(<CategoriesManager onClose={() => {}} />)
    openEdit()
    expect(rolePicker().getByRole('radio', { name: 'ส่วนตัว' })).toBeTruthy()
    expect(rolePicker().getByRole('radio', { name: 'เติมสต็อก' })).toBeTruthy()
    expect(rolePicker().getByRole('radio', { name: 'ของร้าน' })).toBeTruthy()
    r1.unmount()

    categories = [cat({ id: 'i1', name: 'เงินเดือน', kind: 'income', icon: 'cash', color_index: 4 })]
    render(<CategoriesManager onClose={() => {}} />)
    openEdit()
    expect(rolePicker().getByRole('radio', { name: 'ส่วนตัว' })).toBeTruthy()
    expect(rolePicker().getByRole('radio', { name: 'ของร้าน' })).toBeTruthy()
    expect(rolePicker().queryByRole('radio', { name: 'เติมสต็อก' })).toBeNull()
  })

  it('marks the current role as checked', () => {
    categories = [cat({ id: 's1', name: 'เสื้อเข้าร้าน', is_stock_category: true })]
    render(<CategoriesManager onClose={() => {}} />)
    openEdit()
    expect(rolePicker().getByRole('radio', { name: 'เติมสต็อก' }).getAttribute('aria-checked')).toBe('true')
    expect(rolePicker().getByRole('radio', { name: 'ส่วนตัว' }).getAttribute('aria-checked')).toBe('false')
  })

  it('writes both columns when selecting เติมสต็อก (stock on, shop off)', () => {
    categories = [cat({ id: 'e1', name: 'อาหาร' })]
    render(<CategoriesManager onClose={() => {}} />)
    openEdit()
    fireEvent.click(rolePicker().getByRole('radio', { name: 'เติมสต็อก' }))
    expect(setRoleMutate).toHaveBeenCalledWith({
      id: 'e1',
      is_stock_category: true,
      is_shop_category: false,
    })
  })

  it('writes both columns when selecting ของร้าน (stock off, shop on)', () => {
    categories = [cat({ id: 'e1', name: 'อาหาร' })]
    render(<CategoriesManager onClose={() => {}} />)
    openEdit()
    fireEvent.click(rolePicker().getByRole('radio', { name: 'ของร้าน' }))
    expect(setRoleMutate).toHaveBeenCalledWith({
      id: 'e1',
      is_stock_category: false,
      is_shop_category: true,
    })
  })

  it('switches เติมสต็อก → ของร้าน in one write — never (true, true)', () => {
    categories = [cat({ id: 's1', name: 'เสื้อเข้าร้าน', is_stock_category: true })]
    render(<CategoriesManager onClose={() => {}} />)
    openEdit()
    fireEvent.click(rolePicker().getByRole('radio', { name: 'ของร้าน' }))
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
    openEdit()
    fireEvent.click(rolePicker().getByRole('radio', { name: 'ส่วนตัว' }))
    expect(setRoleMutate).not.toHaveBeenCalled()
  })

  it('disables the role picker on a system category', () => {
    categories = [
      cat({ id: 'sys', name: 'ขายสต็อก', kind: 'income', is_system: true, system_key: 'stock_sale_income' }),
    ]
    render(<CategoriesManager onClose={() => {}} />)
    openEdit()
    expect((rolePicker().getByRole('radio', { name: 'ส่วนตัว' }) as HTMLButtonElement).disabled).toBe(true)
    expect((rolePicker().getByRole('radio', { name: 'ของร้าน' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the "past months move" warning for ของร้าน in the edit sheet', () => {
    categories = [cat({ id: 'sh1', name: 'ค่าโฆษณา', is_shop_category: true })]
    render(<CategoriesManager onClose={() => {}} />)
    openEdit()
    // the mandatory phrase — the only thing telling the user this rewrites history
    expect(screen.getByText(/กำไรร้านของเดือนก่อน ๆ จะคิดใหม่/)).toBeTruthy()
  })

  it('does not show the history-rewrite warning for a ส่วนตัว category', () => {
    categories = [cat({ id: 'e1', name: 'อาหาร' })]
    render(<CategoriesManager onClose={() => {}} />)
    openEdit()
    expect(screen.queryByText(/กำไรร้านของเดือนก่อน ๆ จะคิดใหม่/)).toBeNull()
  })
})

describe('CategoriesManager — role picker in the create sheet', () => {
  it('offers เติมสต็อก for รายจ่าย but not for รายรับ', () => {
    render(<CategoriesManager onClose={() => {}} />)
    openCreate()
    // expense is the default kind
    expect(rolePicker().getByRole('radio', { name: 'เติมสต็อก' })).toBeTruthy()
    // switch to income
    fireEvent.click(screen.getByRole('button', { name: 'รายรับ' }))
    expect(rolePicker().queryByRole('radio', { name: 'เติมสต็อก' })).toBeNull()
    expect(rolePicker().getByRole('radio', { name: 'ส่วนตัว' })).toBeTruthy()
    expect(rolePicker().getByRole('radio', { name: 'ของร้าน' })).toBeTruthy()
  })

  it('does not leave a role selected that the new kind cannot offer', () => {
    render(<CategoriesManager onClose={() => {}} />)
    openCreate()
    // pick เติมสต็อก while expense
    fireEvent.click(rolePicker().getByRole('radio', { name: 'เติมสต็อก' }))
    expect(rolePicker().getByRole('radio', { name: 'เติมสต็อก' }).getAttribute('aria-checked')).toBe('true')
    // switching to รายรับ (no เติมสต็อก) must fall back to ส่วนตัว, not hang on a
    // value that can't be shown as selected
    fireEvent.click(screen.getByRole('button', { name: 'รายรับ' }))
    expect(rolePicker().getByRole('radio', { name: 'ส่วนตัว' }).getAttribute('aria-checked')).toBe('true')
  })

  it('does not call useSetCategoryRole from the create sheet (no id yet)', () => {
    render(<CategoriesManager onClose={() => {}} />)
    openCreate()
    fireEvent.click(rolePicker().getByRole('radio', { name: 'ของร้าน' }))
    expect(setRoleMutate).not.toHaveBeenCalled()
  })

  it('does not show the ของร้าน history warning in the create sheet', () => {
    render(<CategoriesManager onClose={() => {}} />)
    openCreate()
    fireEvent.click(rolePicker().getByRole('radio', { name: 'ของร้าน' }))
    expect(screen.queryByText(/กำไรร้านของเดือนก่อน ๆ จะคิดใหม่/)).toBeNull()
  })

  it('saves a new category with its chosen role in one upsert', async () => {
    render(<CategoriesManager onClose={() => {}} />)
    openCreate()
    fireEvent.change(screen.getByPlaceholderText('ชื่อหมวด'), { target: { value: 'ค่าส่ง' } })
    fireEvent.click(rolePicker().getByRole('radio', { name: 'ของร้าน' }))
    fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
    expect(upsertMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ค่าส่ง',
        kind: 'expense',
        is_stock_category: false,
        is_shop_category: true,
      }),
    )
  })
})
