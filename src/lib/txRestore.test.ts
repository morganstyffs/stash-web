import { describe, it, expect } from 'vitest'
import { buildRestoreInsert, type RestorableTx } from '@/lib/txRestore'

// buildRestoreInsert is pure and its lock guard delegates to lib/ledger's
// lockedRowInfo (also pure), so nothing here needs a network or a mock.

const plain: RestorableTx = {
  id: 'tx-1',
  type: 'expense',
  amount: 120,
  category_id: 'cat-1',
  wallet_id: 'w-1',
  date: '2026-07-20',
  note: 'ข้าวเที่ยง',
  created_at: '2026-07-20T05:00:00+00:00',
  is_stock_purchase: false,
  is_stock_cogs: false,
  is_debt_settlement: false,
  stock_item_id: null,
}

describe('buildRestoreInsert', () => {
  it('restores the original id + created_at (not new values) and the given user_id', () => {
    const out = buildRestoreInsert(plain, 'user-9')
    expect(out.id).toBe('tx-1')
    expect(out.created_at).toBe('2026-07-20T05:00:00+00:00')
    expect(out.user_id).toBe('user-9')
    // and the plain editable fields carry over verbatim
    expect(out.amount).toBe(120)
    expect(out.type).toBe('expense')
    expect(out.date).toBe('2026-07-20')
    expect(out.note).toBe('ข้าวเที่ยง')
  })

  it('omits the flags + stock_item_id so DB defaults handle them', () => {
    const out = buildRestoreInsert(plain, 'user-9')
    expect(out).not.toHaveProperty('is_stock_purchase')
    expect(out).not.toHaveProperty('is_stock_cogs')
    expect(out).not.toHaveProperty('is_debt_settlement')
    expect(out).not.toHaveProperty('stock_item_id')
  })

  it('throws on a debt-settlement row instead of building an orphan', () => {
    expect(() => buildRestoreInsert({ ...plain, is_debt_settlement: true }, 'user-9')).toThrow()
  })

  it('throws on a stock-purchase row', () => {
    expect(() => buildRestoreInsert({ ...plain, is_stock_purchase: true }, 'user-9')).toThrow()
  })

  it('throws on a stock-sale (COGS) row', () => {
    expect(() => buildRestoreInsert({ ...plain, is_stock_cogs: true }, 'user-9')).toThrow()
  })
})
