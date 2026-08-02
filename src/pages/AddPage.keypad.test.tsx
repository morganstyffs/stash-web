// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { Category } from '@/lib/db'
import type { HintRow } from '@/hooks/useEntryHints'

// Behaviour tests for the /add rework: the collapsible keypad (§1) and the ONE
// category list ordered by frequency with no duplicate "ใช้บ่อย" row (§2.1).
// jsdom does NOT do layout, so these assert DOM/behaviour only — the "the save
// button and amount are actually visible past the keypad" claim is what the
// real-browser guard (AddPage.keypad.visual.test.ts) exists to prove.

let categoriesData: Category[]
let hintsData: HintRow[]

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: null }),
}))
vi.mock('@/hooks/useLookups', () => ({
  useCategories: () => ({ data: categoriesData }),
  useFavorites: () => ({ data: [] }),
  useUpsertFavorite: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useAddTransaction', () => ({
  useAddTransaction: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}))
vi.mock('@/hooks/useTransactions', () => ({
  useDeleteTransaction: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/useEntryHints', () => ({ useEntryHints: () => ({ data: hintsData }) }))
vi.mock('@/hooks/useSettings', () => ({ useWallets: () => ({ data: [] }) }))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}))
// Rendered as an observable marker so a test can prove the "+ เพิ่มหมวด" button
// actually opens it (Q2 — the handler survived the move to the list's tail).
vi.mock('@/components/CategoriesManager', () => ({
  CategoriesManager: () => 'CATS_MANAGER_OPEN',
}))
vi.mock('@/components/FavoritesManager', () => ({ FavoritesManager: () => null }))

import { AddPage, isEntrySelectableCategory } from '@/pages/AddPage'
import type { TransactionType } from '@/lib/db'

const cat = (over: Partial<Category>): Category => ({
  id: 'c1',
  user_id: 'u1',
  name: 'หมวด',
  kind: 'expense',
  icon: 'tag',
  color_index: 0,
  sort_order: 0,
  is_shop_category: false,
  is_stock_category: false,
  is_system: false,
  system_key: null,
  created_at: '',
  updated_at: '',
  ...over,
})

const hint = (category_id: string, date: string): HintRow => ({
  type: 'expense',
  category_id,
  wallet_id: null,
  date,
  amount: 100,
})

const NAMES = ['อาหาร', 'ช้อปปิ้ง', 'เดินทาง']

const INCOME_NAMES = ['เงินเดือน', 'โบนัส']

beforeEach(() => {
  categoriesData = [
    // selectable expense (the 3 the ordering tests assert on)
    cat({ id: 'food', name: 'อาหาร', sort_order: 0 }),
    cat({ id: 'shop', name: 'ช้อปปิ้ง', sort_order: 1 }),
    cat({ id: 'travel', name: 'เดินทาง', sort_order: 2 }),
    // selectable income
    cat({ id: 'salary', name: 'เงินเดือน', kind: 'income', sort_order: 0 }),
    cat({ id: 'bonus', name: 'โบนัส', kind: 'income', sort_order: 1 }),
    // NON-selectable — must never render on either side (proves the count is the
    // selectable set, not "all rows"): a stock-intake category + a system one.
    cat({ id: 'stk', name: 'ต้นทุนสต็อก', kind: 'expense', is_stock_category: true }),
    cat({ id: 'sale', name: 'ขายสต็อก', kind: 'income', system_key: 'stock_sale_income' }),
  ]
  hintsData = []
})
afterEach(cleanup)

describe('AddPage — collapsible keypad (§1)', () => {
  it('starts expanded: the digit keys are on screen', () => {
    render(<AddPage />)
    expect(screen.getByRole('button', { name: '1' })).toBeTruthy()
    // the toggle offers to collapse (aria-expanded reflects the open state)
    const toggle = screen.getByRole('button', { name: 'ยุบแป้นตัวเลข' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('collapses via the header toggle — the grid leaves the DOM', () => {
    render(<AddPage />)
    fireEvent.click(screen.getByRole('button', { name: 'ยุบแป้นตัวเลข' }))
    expect(screen.queryByRole('button', { name: '1' })).toBeNull()
    // and now offers to expand again
    expect(screen.getByRole('button', { name: 'แสดงแป้นตัวเลข' }).getAttribute('aria-expanded')).toBe(
      'false',
    )
  })

  it('re-expands by tapping the amount (§ "แตะที่ตัวเลขยอดเพื่อกางกลับ")', () => {
    render(<AddPage />)
    fireEvent.click(screen.getByRole('button', { name: 'ยุบแป้นตัวเลข' }))
    expect(screen.queryByRole('button', { name: '1' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'ยอดเงิน — แตะเพื่อแสดงแป้นตัวเลข' }))
    expect(screen.getByRole('button', { name: '1' })).toBeTruthy()
  })

  it('auto-collapses when the user taps OUTSIDE the amount (a category chip)', () => {
    render(<AddPage />)
    expect(screen.getByRole('button', { name: '1' })).toBeTruthy()
    // pointer-down on a category chip (in the scroll area) collapses the keypad
    fireEvent.pointerDown(screen.getByRole('button', { name: 'อาหาร' }))
    expect(screen.queryByRole('button', { name: '1' })).toBeNull()
  })

  it('save button and amount stay in the DOM whether the keypad is open or closed', () => {
    render(<AddPage />)
    // save (disabled, blocked) + the amount control are present while expanded…
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ยอดเงิน — แตะเพื่อแสดงแป้นตัวเลข' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'ยุบแป้นตัวเลข' }))
    // …and still present once collapsed (they live above the grid, not in it)
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ยอดเงิน — แตะเพื่อแสดงแป้นตัวเลข' })).toBeTruthy()
  })
})

describe('AddPage — one category list, frequency-ordered (§2.1)', () => {
  function categoryOrder(): string[] {
    return screen
      .getAllByRole('button')
      .map((b) => b.textContent?.trim() ?? '')
      .filter((t) => NAMES.includes(t))
  }

  it('shows each category exactly once (no duplicate "ใช้บ่อย" row)', () => {
    render(<AddPage />)
    const order = categoryOrder()
    expect(order.sort()).toEqual([...NAMES].sort())
    // "ใช้บ่อย" heading is gone
    expect(screen.queryByText('ใช้บ่อย')).toBeNull()
  })

  it('floats the most-used category to the head of the list', () => {
    // เดินทาง used 3×, ช้อปปิ้ง 1× → เดินทาง should lead; อาหาร (no history) trails
    // in its sort_order slot.
    hintsData = [
      hint('travel', '2026-07-01'),
      hint('travel', '2026-07-02'),
      hint('travel', '2026-07-03'),
      hint('shop', '2026-07-01'),
    ]
    render(<AddPage />)
    expect(categoryOrder()).toEqual(['เดินทาง', 'ช้อปปิ้ง', 'อาหาร'])
  })

  it('keeps sort_order when there is no history', () => {
    render(<AddPage />)
    expect(categoryOrder()).toEqual(['อาหาร', 'ช้อปปิ้ง', 'เดินทาง'])
  })

  it('the + เพิ่มหมวด control is not counted among the categories', () => {
    render(<AddPage />)
    // it exists, but as its own dashed affordance — never one of the 3 names
    const add = screen.getByRole('button', { name: /เพิ่มหมวด/ })
    expect(within(add).queryByText(NAMES[0])).toBeNull()
  })
})

describe('AddPage — + เพิ่มหมวด still opens the category manager (§Q2)', () => {
  it('clicking it mounts CategoriesManager (handler survived the move to the tail)', () => {
    render(<AddPage />)
    expect(screen.queryByText('CATS_MANAGER_OPEN')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มหมวด/ }))
    expect(screen.getByText('CATS_MANAGER_OPEN')).toBeTruthy()
  })
})

describe('AddPage — no category is dropped: rendered == selectable (§Q3)', () => {
  // The bug family this guards (donut legend slice(0,3) hiding categories):
  // reordering the list must never shrink it. Count the rendered chips against
  // isEntrySelectableCategory — the single source of "what may be picked".
  function renderedNamesFor(type: TransactionType): string[] {
    const selectable = categoriesData
      .filter((c) => isEntrySelectableCategory(c, type))
      .map((c) => c.name)
    const rendered = screen
      .getAllByRole('button')
      .map((b) => b.textContent?.trim() ?? '')
      .filter((t) => selectable.includes(t))
    return rendered
  }

  it('expense: renders exactly the selectable expense categories, no more, no fewer', () => {
    render(<AddPage />)
    const selectable = categoriesData.filter((c) => isEntrySelectableCategory(c, 'expense'))
    const rendered = renderedNamesFor('expense')
    expect(rendered.length).toBe(selectable.length) // 3, not the 4 expense ROWS (stock excluded)
    expect(new Set(rendered)).toEqual(new Set(selectable.map((c) => c.name)))
    // the non-selectable rows never leak in
    expect(screen.queryByText('ต้นทุนสต็อก')).toBeNull()
  })

  it('income: switching to รับ renders exactly the selectable income categories', () => {
    render(<AddPage />)
    fireEvent.click(screen.getByRole('button', { name: 'รับ' }))
    const selectable = categoriesData.filter((c) => isEntrySelectableCategory(c, 'income'))
    const rendered = renderedNamesFor('income')
    expect(rendered.length).toBe(selectable.length) // 2 (ขายสต็อก/stock_sale_income excluded)
    expect(new Set(rendered)).toEqual(new Set(INCOME_NAMES))
    expect(screen.queryByText('ขายสต็อก')).toBeNull()
  })

  it('a category ranked frequent AND the rest all survive the reorder (count unchanged)', () => {
    hintsData = [hint('travel', '2026-07-01'), hint('travel', '2026-07-02')]
    render(<AddPage />)
    // เดินทาง leads, but all 3 selectable expense categories are still present
    expect(renderedNamesFor('expense').length).toBe(3)
  })
})
