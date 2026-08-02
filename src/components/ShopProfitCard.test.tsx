// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  ShopProfitCardView,
  periodRange,
  REVALUATION_NOTE,
} from '@/components/ShopProfitCard'
import type { SalesSummary } from '@/hooks/useStockSales'
import type { ShopOperating } from '@/hooks/useShopOperating'

const sales = (over: Partial<SalesSummary> = {}): SalesSummary => ({
  revenue: 12_400,
  cogs: 7_200,
  profit: 5_200,
  sale_count: 3,
  qty_sold: 3,
  ...over,
})
const shop = (over: Partial<ShopOperating> = {}): ShopOperating => ({
  income: 0,
  expense: 850,
  capped: false,
  ...over,
})

function view(props: Partial<Parameters<typeof ShopProfitCardView>[0]> = {}) {
  return render(
    <ShopProfitCardView
      period="month"
      onPeriodChange={() => {}}
      sales={sales()}
      shop={shop()}
      hideBalance={false}
      {...props}
    />,
  )
}

afterEach(cleanup)

describe('ShopProfitCardView', () => {
  it('lays the formula out top-down and lands net profit = gross − operating', () => {
    view()
    expect(screen.getByText('฿12,400')).toBeTruthy() // ยอดขาย
    expect(screen.getByText('−฿7,200')).toBeTruthy() // ต้นทุนที่ขายไป
    expect(screen.getByText('฿5,200')).toBeTruthy() // กำไรขั้นต้น
    expect(screen.getByText('−฿850')).toBeTruthy() // ค่าดำเนินร้าน (จ่าย > เก็บ)
    expect(screen.getByText('฿4,350')).toBeTruthy() // กำไรสุทธิ
  })

  it('always shows the "past months move when you re-tag" note', () => {
    view()
    expect(screen.getByText(REVALUATION_NOTE)).toBeTruthy()
  })

  it('empty period shows an invitation, never a card full of ฿0', () => {
    view({ sales: sales({ revenue: 0, cogs: 0, profit: 0, sale_count: 0, qty_sold: 0 }), shop: shop({ income: 0, expense: 0 }) })
    expect(screen.getByText(/ยังไม่มีการขายหรือค่าใช้จ่ายร้าน/)).toBeTruthy()
    expect(screen.queryByText('฿0')).toBeNull()
  })

  it('a net LOSS shows the warning icon and a negative figure', () => {
    const { container } = view({
      sales: sales({ revenue: 300, cogs: 200, profit: 100 }),
      shop: shop({ income: 0, expense: 900 }), // net = 100 − 900 = −800
    })
    expect(screen.getByText('−฿800')).toBeTruthy()
    expect(container.querySelector('.tabler-icon-alert-triangle')).toBeTruthy()
  })

  it('collecting more shipping than paid shows operating as a +gain', () => {
    view({ shop: shop({ income: 300, expense: 200 }) }) // operatingNet −100 → shown +฿100
    expect(screen.getByText('+฿100')).toBeTruthy()
  })

  it('expands ค่าดำเนินร้าน into จ่ายไป / เก็บได้', () => {
    view({ shop: shop({ income: 40, expense: 850 }) })
    // detail hidden until the row is tapped
    expect(screen.queryByText(/จ่ายไป/)).toBeNull()
    fireEvent.click(screen.getByText('ค่าดำเนินร้าน'))
    expect(screen.getByText(/จ่ายไป/)).toBeTruthy()
    expect(screen.getByText(/เก็บได้/)).toBeTruthy()
  })

  it('hide-balance masks every figure and leaks no real number', () => {
    view({ hideBalance: true })
    expect(screen.getAllByText('฿ ••••').length).toBeGreaterThan(0)
    expect(screen.queryByText('฿12,400')).toBeNull()
    expect(screen.queryByText('฿4,350')).toBeNull()
  })

  it('warns when the shop row cap was hit (totals may be short)', () => {
    view({ shop: shop({ capped: true }) })
    expect(screen.getByText(/ตัวเลขอาจไม่ครบ/)).toBeTruthy()
  })

  it('renders per-line placeholders while a query is still in flight', () => {
    view({ sales: undefined })
    // gross lines + the net line fall back to a placeholder, not a fake ฿0
    expect(screen.getAllByText('…').length).toBeGreaterThan(0)
    // the shop side that DID load still shows its own split on expand
    fireEvent.click(screen.getByText('ค่าดำเนินร้าน'))
    expect(screen.getByText('−฿850')).toBeTruthy()
  })
})

describe('periodRange — window for each period', () => {
  const now = new Date('2026-08-15T12:00:00+07:00') // Bangkok August

  it('month = this calendar month [1st, next 1st)', () => {
    expect(periodRange('month', now)).toEqual({ from: '2026-08-01', to: '2026-09-01' })
  })

  it('trailing3 = this month + the two before it', () => {
    expect(periodRange('trailing3', now)).toEqual({ from: '2026-06-01', to: '2026-09-01' })
  })
})
