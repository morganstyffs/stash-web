// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import {
  WovenHero,
  budgetMini,
  budgetOverAmount,
  budgetSubline,
  deltaChip,
  endedSubline,
  overBudgetChip,
  safeBig,
  safeMini,
  stockSubline,
  type WovenHeroProps,
} from '@/components/WovenHero'
import { formatBaht, MASKED_BAHT } from '@/lib/format'
import type { SalesSummary } from '@/hooks/useStockSales'

// These cover the pure text-selection edge cases the spec calls out — the same
// numbers a real hook would feed in, so a wrong branch shows up as wrong copy.

const sales = (over: Partial<SalesSummary> = {}): SalesSummary => ({
  revenue: 0,
  cogs: 0,
  profit: 0,
  sale_count: 0,
  qty_sold: 0,
  ...over,
})

describe('safe label', () => {
  // The sub-line's money decision is tested in lib/spendable.test.ts; here we only
  // check the headline helpers. Negative safe-to-spend shows as-is, never clamped.
  it('shows a negative safe-to-spend headline as-is (never clamped)', () => {
    expect(safeBig(-1_500, false)).toBe(formatBaht(-1_500))
  })

  it('masks both the headline and the folded figure while hidden', () => {
    expect(safeBig(9_000, true)).toBe('฿ ••••••')
    expect(safeMini(9_000, true)).toBe('••••')
    // and reveals them when not hidden
    expect(safeBig(9_000, false)).toBe(formatBaht(9_000))
    expect(safeMini(9_000, false)).toBe(formatBaht(9_000))
  })
})

describe('budget label', () => {
  it('prompts to set a budget when none exists, with no over-chip', () => {
    expect(budgetSubline(0, 0)).toEqual({ unset: true, text: 'ยังไม่ได้ตั้งงบ' })
    expect(overBudgetChip(0, 0)).toBeNull()
    expect(budgetOverAmount(0, 5_000)).toBeNull()
  })

  it('reports spending (COGS excluded copy) when a budget is set', () => {
    expect(budgetSubline(10_000, 4_000)).toEqual({
      unset: false,
      text: `ใช้ไปแล้ว ${formatBaht(4_000)} (ไม่รวมต้นทุนขาย)`,
    })
  })

  it('surfaces the overshoot on the chip and the folded figure when over', () => {
    expect(budgetOverAmount(10_000, 12_500)).toBe(2_500)
    expect(overBudgetChip(10_000, 12_500)).toBe(`เกินงบ ${formatBaht(2_500)}`)
    expect(budgetMini(10_000, 12_500)).toBe(`เกิน ${formatBaht(2_500)}`)
  })

  it('shows the budget total on the folded figure while within budget', () => {
    expect(overBudgetChip(10_000, 4_000)).toBeNull()
    expect(budgetMini(10_000, 4_000)).toBe(formatBaht(10_000))
  })
})

describe('stock label', () => {
  it('shows an empty-state when nothing sold this month', () => {
    expect(stockSubline(sales({ qty_sold: 0 }))).toBe('ยังไม่มีการขายเดือนนี้')
  })

  it('breaks down revenue / cost / units once there are sales', () => {
    expect(stockSubline(sales({ revenue: 3_000, cogs: 1_200, qty_sold: 4, profit: 1_800 }))).toBe(
      `ขาย ${formatBaht(3_000)} · ต้นทุน ${formatBaht(1_200)} · 4 ชิ้น`,
    )
  })
})

describe('ended-month safe label', () => {
  // A closed month recaps รับ/จ่าย in place of the live per-day line.
  it('shows both figures for a closed month', () => {
    const line = endedSubline(12_000, 8_000, false)
    expect(line).toContain(formatBaht(12_000))
    expect(line).toContain(formatBaht(8_000))
    expect(line).toBe(`รับ ${formatBaht(12_000)} · จ่าย ${formatBaht(8_000)}`)
  })

  it('masks BOTH figures together while the balance is hidden (never one leaking)', () => {
    const line = endedSubline(12_000, 8_000, true)
    expect(line).toContain(MASKED_BAHT)
    expect(line).not.toContain(formatBaht(12_000))
    expect(line).not.toContain(formatBaht(8_000))
    expect(line).toBe(`รับ ${MASKED_BAHT} · จ่าย ${MASKED_BAHT}`)
  })
})

describe('delta chip', () => {
  it('is absent when there is no comparison basis', () => {
    expect(deltaChip(null)).toBeNull()
  })

  it('points up for an improvement and down for a decline', () => {
    expect(deltaChip(12)).toEqual({ up: true, text: '12% ดีกว่าเดือนก่อน' })
    expect(deltaChip(-8)).toEqual({ up: false, text: '8% ต่ำกว่าเดือนก่อน' })
  })
})

// ── rendering (jsdom) — the reported bug was "folded labels are blank strips" ─
// The pure helpers above can't catch that: the component renders EYEBROW[key]
// for every label unconditionally, so if the titles ever go missing it's a
// render-time regression, not a text-selection one. These tests assert the real
// DOM, whichever label is the face. (See STASH_CONTEXT §9 traps: "verification
// proves it exists, not that it works".)

const STOCK: SalesSummary = {
  revenue: 5_000,
  cogs: 3_200,
  profit: 1_800,
  sale_count: 3,
  qty_sold: 4,
}

function renderHero(over: Partial<WovenHeroProps> = {}) {
  const props: WovenHeroProps = {
    safeToSpend: 9_000,
    daysLeft: 10,
    deltaPct: null,
    budgetTotal: 10_000,
    budgetSpending: 4_000,
    stock: STOCK,
    hideBalance: false,
    onToggleHide: () => {},
    income: 0,
    expense: 0,
    ...over,
  }
  return render(
    <MemoryRouter>
      <WovenHero {...props} />
    </MemoryRouter>,
  )
}

const EYEBROWS = ['SAFE TO SPEND', 'BUDGET', 'STOCK PROFIT']

afterEach(cleanup)

describe('WovenHero rendering — every label title is always present', () => {
  it('renders all three eyebrows no matter which label is the face', () => {
    renderHero()
    for (const eyebrow of EYEBROWS) expect(screen.getByText(eyebrow)).toBeTruthy()

    // bring BUDGET forward, then STOCK — folded eyebrows must not vanish
    fireEvent.click(screen.getByLabelText('ป้ายงบประมาณ'))
    for (const eyebrow of EYEBROWS) expect(screen.getByText(eyebrow)).toBeTruthy()

    fireEvent.click(screen.getByLabelText('ป้ายกำไรสต็อก'))
    for (const eyebrow of EYEBROWS) expect(screen.getByText(eyebrow)).toBeTruthy()
  })
})

describe('WovenHero rendering — folded labels show a compact figure', () => {
  it('shows the front headline plus both folded labels’ minis', () => {
    renderHero()
    // safe is the face → full headline; budget + stock folded → their minis
    expect(screen.getByText(formatBaht(9_000))).toBeTruthy() // safe headline
    expect(screen.getByText(formatBaht(10_000))).toBeTruthy() // budget mini (within budget → total)
    expect(screen.getByText(formatBaht(1_800))).toBeTruthy() // stock mini (profit)
  })

  it('shows the safe mini once safe is folded behind another label', () => {
    renderHero()
    fireEvent.click(screen.getByLabelText('ป้ายงบประมาณ')) // budget → face, safe → folded
    expect(screen.getAllByText(formatBaht(9_000)).length).toBeGreaterThan(0)
  })
})

describe('WovenHero rendering — hideBalance masks the safe figure everywhere', () => {
  it('masks the safe headline on the face while keeping its title', () => {
    renderHero({ hideBalance: true })
    expect(screen.getByText('฿ ••••••')).toBeTruthy() // masked headline
    expect(screen.queryByText(formatBaht(9_000))).toBeNull() // real figure gone
    expect(screen.getByText('SAFE TO SPEND')).toBeTruthy() // title stays
  })

  it('masks the safe mini once safe is folded, keeping the eyebrow', () => {
    renderHero({ hideBalance: true })
    fireEvent.click(screen.getByLabelText('ป้ายงบประมาณ')) // safe → folded
    expect(screen.getByText('••••')).toBeTruthy() // masked mini
    expect(screen.queryByText(formatBaht(9_000))).toBeNull() // real figure gone
    expect(screen.getByText('SAFE TO SPEND')).toBeTruthy() // title stays
  })
})

describe('WovenHero — BUDGET label opens the budget screen', () => {
  // Render the hero at "/" with a stand-in /budget route so a real navigation
  // (not a mock) proves the arrow reaches the budget page.
  function renderWithBudgetRoute(over: Partial<WovenHeroProps> = {}) {
    const props: WovenHeroProps = {
      safeToSpend: 9_000,
      daysLeft: 10,
      deltaPct: null,
      budgetTotal: 10_000,
      budgetSpending: 4_000,
      stock: STOCK,
      hideBalance: false,
      onToggleHide: () => {},
      income: 0,
      expense: 0,
      ...over,
    }
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<WovenHero {...props} />} />
          <Route path="/budget" element={<div>BUDGET SCREEN</div>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('shows the open-budget arrow only once BUDGET is the front label, and it navigates to /budget', () => {
    renderWithBudgetRoute()
    // SAFE is the face by default → no budget arrow yet.
    expect(screen.queryByLabelText('เปิดหน้างบประมาณ')).toBeNull()

    // Bring BUDGET forward (the fold-to-front tap), then use the arrow.
    fireEvent.click(screen.getByLabelText('ป้ายงบประมาณ'))
    fireEvent.click(screen.getByLabelText('เปิดหน้างบประมาณ'))
    expect(screen.getByText('BUDGET SCREEN')).toBeTruthy()
  })

  it('does not hijack the fold-to-front tap: tapping the folded BUDGET label only brings it forward', () => {
    renderWithBudgetRoute()
    // Tapping the folded label switches it to the front — it must NOT navigate.
    fireEvent.click(screen.getByLabelText('ป้ายงบประมาณ'))
    expect(screen.queryByText('BUDGET SCREEN')).toBeNull()
    // ...and now that BUDGET is expanded, the separate arrow affordance is present.
    expect(screen.getByLabelText('เปิดหน้างบประมาณ')).toBeTruthy()
  })
})

describe('WovenHero rendering — SAFE sub-line reflects upcoming bills', () => {
  it('deducts the bills and shows the after-bills daily rate', () => {
    renderHero({ safeToSpend: 26_948, upcomingBills: 19_000, daysLeft: 2 })
    // 26,948 − 19,000 = 7,948 over 2 days = 3,974/day
    expect(
      screen.getByText(
        `เหลืออีก 2 วัน · หักบิลที่จะมาถึง ${formatBaht(19_000)} · ใช้ได้วันละ ${formatBaht(3_974)}`,
      ),
    ).toBeTruthy()
  })

  it('warns when bills exceed the balance — no negative daily rate', () => {
    renderHero({ safeToSpend: 10_000, upcomingBills: 15_000, daysLeft: 10 })
    expect(screen.getByText(/เกินยอดที่ใช้ได้/)).toBeTruthy()
    expect(screen.queryByText(/ใช้ได้วันละ/)).toBeNull()
  })

  it('keeps the plain average line when there are no bills', () => {
    renderHero({ safeToSpend: 9_000, daysLeft: 10 })
    expect(screen.getByText(`เหลืออีก 10 วัน · เฉลี่ยวันละ ${formatBaht(900)}`)).toBeTruthy()
  })

  it('masks the bill figures on the sub-line while the balance is hidden', () => {
    renderHero({ safeToSpend: 26_948, upcomingBills: 19_000, daysLeft: 2, hideBalance: true })
    expect(screen.getByText(/หักบิลที่จะมาถึง ฿ ••••/)).toBeTruthy() // masked figure
    expect(screen.queryByText(/฿19,000/)).toBeNull() // real figure gone
  })
})
