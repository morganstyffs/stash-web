// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// HomePage pulls a whole data layer; stub every hook so this stays a focused test
// of the header (the new settings gear) with a real router underneath — the gear
// is a plain <button> that navigate()s, so a real /settings route proves it lands.
vi.mock('@/hooks/useLookups', () => ({ useCategories: () => ({ data: [], isLoading: false }) }))
vi.mock('@/hooks/useAttention', () => ({
  useAttentionSignals: () => ({ data: { total: 0, needsDetails: 0, stale: 0 } }),
}))
vi.mock('@/hooks/useHome', () => ({
  useMonthTransactions: () => ({ data: [], isLoading: false }),
  useRecentTransactions: () => ({ data: [], isLoading: false }),
  computeHomeSummary: () => ({
    safeToSpend: 0,
    daysLeft: 0,
    deltaPct: null,
    budgetSpending: 0,
    income: 0,
    expense: 0,
    donut: [],
  }),
}))
vi.mock('@/hooks/useUpcomingBills', () => ({
  useUpcomingBills: () => ({
    data: { total: 0, hasRules: false, items: [] },
    error: null,
    isLoading: false,
  }),
}))
vi.mock('@/hooks/useBudgets', () => ({ useMonthBudgetTotal: () => ({ data: 0 }) }))
vi.mock('@/hooks/useStockSales', () => ({
  useStockSalesSummary: () => ({
    data: { revenue: 0, cogs: 0, profit: 0, sale_count: 0, qty_sold: 0 },
    isLoading: false,
  }),
}))
vi.mock('@/hooks/useHomeMoments', () => ({
  useHomeMoments: () => ({ newMonth: false, firstSale: false }),
}))
vi.mock('@/hooks/useHideBalance', () => ({
  useHideBalance: () => ({ hideBalance: false, toggleHideBalance: () => {} }),
}))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), show: vi.fn(), dismiss: vi.fn() }),
}))

import { HomePage } from '@/pages/HomePage'

afterEach(cleanup)

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<div>SETTINGS SCREEN</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('HomePage — settings gear in the top-right corner', () => {
  it('has a Thai-labelled gear that navigates to /settings', () => {
    renderHome()
    const gear = screen.getByLabelText('ตั้งค่า')
    fireEvent.click(gear)
    expect(screen.getByText('SETTINGS SCREEN')).toBeTruthy()
  })

  it('keeps the เรื่องที่รอดู bell alongside the gear (gear does not replace it)', () => {
    renderHome()
    // both the bell and the gear are present in the header, side by side.
    expect(screen.getByLabelText('เรื่องที่รอดู — ไม่มีตอนนี้')).toBeTruthy()
    expect(screen.getByLabelText('ตั้งค่า')).toBeTruthy()
  })
})
