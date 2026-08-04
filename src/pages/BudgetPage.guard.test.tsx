// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Category } from '@/lib/db'
import type { BudgetRow } from '@/hooks/useBudgets'
import { MASKED_BAHT } from '@/lib/format'

/**
 * Guard for ใบ 5 tasks 2 + 1 at the page level, on the REAL BudgetPage:
 *   • a stale budget on a now-unbudgetable category (ต้นทุนขายสต็อก) is hidden
 *     from the list AND left out of the total (so ฿5,000 stops eating the quota);
 *   • the ตั้งงบ picker only offers budgetable categories;
 *   • the per-category note shows the decision number ("เหลือ ฿X"), not a verdict;
 *   • hideBalance masks the row/hero baht.
 *
 * The category role flags decide all of this, so the data hooks are mocked to hand
 * the page exactly the mix that bit the owner in production.
 */

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
    sort_order: 10,
    created_at: '',
    updated_at: '',
    ...over,
  }) as Category

// Categories: two budgetable expenses (one already budgeted, one addable) + the
// three excluded groups + an income category.
const FOOD = cat({ id: 'food', name: 'อาหาร', icon: 'coffee' })
const TRANSPORT = cat({ id: 'transport', name: 'เดินทาง', icon: 'motorbike' })
const COGS = cat({ id: 'cogs', name: 'ต้นทุนขายสต็อก', is_system: true, system_key: 'stock_cogs' })
const SHOP = cat({ id: 'shop', name: 'ค่าส่งของร้าน', is_shop_category: true })
const STOCK = cat({ id: 'stock', name: 'เสื้อเข้าร้าน', is_stock_category: true })
const SALARY = cat({ id: 'salary', name: 'เงินเดือน', kind: 'income' })
const CATEGORIES = [FOOD, TRANSPORT, COGS, SHOP, STOCK, SALARY]

const budgetRow = (id: string, category_id: string, amount: number, c: Category): BudgetRow => ({
  id,
  category_id,
  amount,
  category: {
    name: c.name,
    icon: c.icon,
    color_index: c.color_index,
    kind: c.kind,
    is_system: c.is_system,
    is_shop_category: c.is_shop_category,
    is_stock_category: c.is_stock_category,
  },
})

// A normal food budget (฿10,000) + a stale ต้นทุนขายสต็อก budget (฿5,000, the bug).
const BUDGETS: BudgetRow[] = [
  budgetRow('b-food', 'food', 10_000, FOOD),
  budgetRow('b-cogs', 'cogs', 5_000, COGS),
]
const SPENDING: Record<string, number> = { food: 500 }

let hideBalance = false
const toggleHideBalance = vi.fn(() => {
  hideBalance = !hideBalance
})

vi.mock('@/hooks/useBudgets', async (importActual) => {
  const actual = await importActual<typeof import('@/hooks/useBudgets')>()
  return {
    ...actual,
    useBudgets: () => ({ data: BUDGETS, isLoading: false }),
    useMonthSpending: () => ({ data: SPENDING }),
    useUpsertBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useDeleteBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  }
})
vi.mock('@/hooks/useLookups', () => ({ useCategories: () => ({ data: CATEGORIES }) }))
vi.mock('@/hooks/useHideBalance', () => ({
  useHideBalance: () => ({ hideBalance, toggleHideBalance }),
}))
vi.mock('@/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
// BudgetPage now embeds <AskAiButton>, which reads consent via useConsent (a
// react-query hook). This suite renders the page without a QueryClientProvider, so
// the real hook would throw — mock it to 'off' (the ถาม AI button hides), keeping
// these budget assertions about exactly what they were before.
vi.mock('@/hooks/useAiSettings', () => ({ useConsent: () => ({ data: 'off' }) }))

const { BudgetPage } = await import('@/pages/BudgetPage')

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/budget']}>
      <BudgetPage />
    </MemoryRouter>,
  )

// Pin mid-month so the food row's 5%-of-budget spend reads on_track deterministically
// (near day 1 the elapsed fraction is tiny and 5% would tip to "fast"). computePace
// reads the real clock inside the component, so the clock is what we pin.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-15T12:00:00+07:00'))
})

afterEach(() => {
  vi.useRealTimers()
  hideBalance = false
  cleanup()
})

describe('BudgetPage — unbudgetable stale rows are hidden and uncounted', () => {
  it('does not list the ต้นทุนขายสต็อก budget row', () => {
    renderPage()
    expect(screen.queryByText('ต้นทุนขายสต็อก')).toBeNull()
    expect(screen.getByText('อาหาร')).toBeTruthy()
  })

  it('the total leaves out the ฿5,000 stale budget (quota is ฿10,000, not ฿15,000)', () => {
    renderPage()
    // hero used/total line: "ใช้ไป ฿500 / ฿10,000"
    expect(screen.getByText(/ใช้ไป\s+฿500\s+\/\s+฿10,000/)).toBeTruthy()
    expect(screen.queryByText(/฿15,000/)).toBeNull()
  })

  it('the food row shows the decision number, not a verdict word', () => {
    renderPage()
    // remaining = 10,000 − 500
    expect(screen.getByText('เหลือ ฿9,500')).toBeTruthy()
    expect(screen.queryByText('พอดีจังหวะ')).toBeNull()
  })
})

describe('BudgetPage — the ตั้งงบ picker only offers budgetable categories', () => {
  it('excludes system/shop/stock/income + already-budgeted from the select', () => {
    renderPage()
    fireEvent.click(screen.getByText('ตั้งงบเพิ่ม'))
    const combo = screen.getByRole('combobox') as HTMLSelectElement
    const options = within(combo)
      .queryAllByRole('option')
      .map((o) => o.textContent)
    // only เดินทาง is budgetable AND unbudgeted; อาหาร is already budgeted.
    expect(options).toEqual(['เดินทาง'])
    expect(options).not.toContain('ต้นทุนขายสต็อก')
    expect(options).not.toContain('ค่าส่งของร้าน')
    expect(options).not.toContain('เสื้อเข้าร้าน')
    expect(options).not.toContain('เงินเดือน')
  })
})

describe('BudgetPage — hideBalance masks the row + hero baht', () => {
  it('masks "เหลือ" and the hero figure when hideBalance is on', () => {
    hideBalance = true
    renderPage()
    // the note keeps the word แต่ masks the figure
    expect(screen.getByText(`เหลือ ${MASKED_BAHT}`)).toBeTruthy()
    expect(screen.queryByText('เหลือ ฿9,500')).toBeNull()
    // hero used/total both masked
    expect(screen.getByText(new RegExp(`ใช้ไป\\s+${MASKED_BAHT}\\s+/\\s+${MASKED_BAHT}`))).toBeTruthy()
  })
})
