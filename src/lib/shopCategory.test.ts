import { describe, it, expect } from 'vitest'
import { hasShopIncomeCategory, pickShopIncomeCategory } from '@/lib/shopCategory'

// Minimal structural rows — the resolvers only read kind + is_shop_category.
const cat = (over: { id: string; kind?: 'income' | 'expense'; is_shop_category?: boolean }) => ({
  kind: 'income' as const,
  is_shop_category: true,
  ...over,
})

describe('pickShopIncomeCategory — the shop income category to preselect', () => {
  it('returns the id when there is exactly one shop income category', () => {
    const cats = [
      cat({ id: 'ship' }),
      cat({ id: 'salary', is_shop_category: false }),
      cat({ id: 'ads', kind: 'expense' }),
    ]
    expect(pickShopIncomeCategory(cats)).toBe('ship')
  })

  it('returns null when there are several (owner made extra ones) — let them choose', () => {
    const cats = [cat({ id: 'ship-1' }), cat({ id: 'ship-2' })]
    expect(pickShopIncomeCategory(cats)).toBeNull()
  })

  it('returns null when there are none', () => {
    expect(pickShopIncomeCategory([])).toBeNull()
    expect(pickShopIncomeCategory([cat({ id: 'salary', is_shop_category: false })])).toBeNull()
  })

  it('never picks a shop category on the EXPENSE side (paid-out shipping is not this)', () => {
    const cats = [cat({ id: 'ship-paid', kind: 'expense' })]
    expect(pickShopIncomeCategory(cats)).toBeNull()
    // and an income one alongside an expense one still resolves to the income one
    expect(pickShopIncomeCategory([cat({ id: 'in' }), cat({ id: 'out', kind: 'expense' })])).toBe(
      'in',
    )
  })
})

describe('hasShopIncomeCategory — whether the nudge shows at all', () => {
  it('is true when at least one shop income category exists', () => {
    expect(hasShopIncomeCategory([cat({ id: 'ship' })])).toBe(true)
    // several still counts — the nudge shows, it just won't preselect
    expect(hasShopIncomeCategory([cat({ id: 'a' }), cat({ id: 'b' })])).toBe(true)
  })

  it('is false when there are none — a shop expense category does not count', () => {
    expect(hasShopIncomeCategory([])).toBe(false)
    expect(hasShopIncomeCategory([cat({ id: 'salary', is_shop_category: false })])).toBe(false)
    expect(hasShopIncomeCategory([cat({ id: 'ship-paid', kind: 'expense' })])).toBe(false)
  })
})
