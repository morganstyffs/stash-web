import { describe, it, expect } from 'vitest'
import { computeShopProfit } from '@/lib/shopAccount'

describe('computeShopProfit — gross − operating = net', () => {
  it('paying more than you collect lowers net below gross', () => {
    // gross 5,200; paid 850 shipping/etc, collected 0 → operatingNet 850
    const p = computeShopProfit({ grossProfit: 5_200, shopIncome: 0, shopExpense: 850 })
    expect(p.grossProfit).toBe(5_200)
    expect(p.operatingNet).toBe(850)
    expect(p.netProfit).toBe(4_350)
  })

  it('collecting MORE shipping than you pay lifts net ABOVE gross', () => {
    // collected 300 from customers, paid 200 → operatingNet −100 (a net gain)
    const p = computeShopProfit({ grossProfit: 1_000, shopIncome: 300, shopExpense: 200 })
    expect(p.operatingNet).toBe(-100)
    expect(p.netProfit).toBe(1_100) // gross 1000 − (−100) = 1100
  })

  it('a net LOSS stays negative — never clamped to 0', () => {
    // tiny gross, heavy operating cost → negative net
    const p = computeShopProfit({ grossProfit: 200, shopIncome: 0, shopExpense: 900 })
    expect(p.operatingNet).toBe(900)
    expect(p.netProfit).toBe(-700)
  })

  it('no activity → all zeros (not a thrown/NaN)', () => {
    const p = computeShopProfit({ grossProfit: 0, shopIncome: 0, shopExpense: 0 })
    expect(p).toEqual({ grossProfit: 0, operatingNet: 0, netProfit: 0 })
  })
})
