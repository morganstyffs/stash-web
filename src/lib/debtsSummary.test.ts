import { describe, it, expect } from 'vitest'
import { computeDebtsHeadline, computeFriendLedger, friendDirection } from '@/lib/debtsSummary'
import type { Debt, FriendDebtsSummary } from '@/lib/db'

/** Minimal row factory — only the fields the headline reads need to be real. */
function row(over: Partial<FriendDebtsSummary>): FriendDebtsSummary {
  return {
    friend_id: 'f',
    display_name: 'เพื่อน',
    shared_they_owe_me: 0,
    shared_i_owe_them: 0,
    shared_net: 0,
    private_they_owe_me: 0,
    private_i_owe_them: 0,
    private_net: 0,
    ...over,
  }
}

describe('computeDebtsHeadline', () => {
  it('sums positive and negative nets into separate gross figures (never blended)', () => {
    const h = computeDebtsHeadline([
      row({ shared_net: 500 }), // a friend owes me 500
      row({ shared_net: -300 }), // I owe another 300
      row({ shared_net: 200 }), // a friend owes me 200
    ])
    expect(h.theyOweMe).toBe(700)
    expect(h.iOweThem).toBe(300)
    expect(h.friendCount).toBe(3)
  })

  it('counts a cleared friend (net 0) toward friendCount but neither total', () => {
    const h = computeDebtsHeadline([row({ shared_net: 0 }), row({ shared_net: 0 })])
    expect(h).toEqual({ theyOweMe: 0, iOweThem: 0, friendCount: 2 })
  })

  it('ignores the PRIVATE columns entirely — private notes never reach the headline', () => {
    const h = computeDebtsHeadline([
      row({ shared_net: 100, private_net: 9999, private_they_owe_me: 9999 }),
    ])
    expect(h.theyOweMe).toBe(100)
    expect(h.iOweThem).toBe(0)
  })

  it('is empty for no friends', () => {
    expect(computeDebtsHeadline([])).toEqual({ theyOweMe: 0, iOweThem: 0, friendCount: 0 })
  })
})

describe('friendDirection', () => {
  it('reads the sign of the shared net', () => {
    expect(friendDirection(500)).toBe('owes_me')
    expect(friendDirection(-300)).toBe('i_owe')
    expect(friendDirection(0)).toBe('clear')
  })
})

const ME = 'me-uuid'
const FRIEND = 'friend-uuid'

/** Debt fixture — only the fields the ledger reads matter; the rest are filler. */
function debt(over: Partial<Debt>): Debt {
  return {
    id: Math.random().toString(36).slice(2),
    creditor_id: ME,
    debtor_id: FRIEND,
    amount: 100,
    reason: null,
    due_date: null,
    visibility: 'shared',
    status: 'confirmed',
    created_by: ME,
    rejected_reason: null,
    settlement_transaction_id: null,
    settled_by: null,
    created_at: '2026-07-01T00:00:00Z',
    confirmed_at: null,
    rejected_at: null,
    cancelled_at: null,
    settled_at: null,
    updated_at: '2026-07-01T00:00:00Z',
    ...over,
  }
}

describe('computeFriendLedger', () => {
  it('agreed net = confirmed shared, signed by my role (matches shared_net)', () => {
    const l = computeFriendLedger(
      [
        debt({ creditor_id: ME, debtor_id: FRIEND, amount: 500 }), // friend owes me
        debt({ creditor_id: FRIEND, debtor_id: ME, amount: 200 }), // I owe friend
      ],
      ME,
    )
    expect(l.agreedNet).toBe(300)
    expect(l.agreedItems).toHaveLength(2)
  })

  it('keeps the private total separate and never folds it into agreed', () => {
    const l = computeFriendLedger(
      [
        debt({ visibility: 'shared', status: 'confirmed', creditor_id: ME, amount: 500 }),
        debt({ visibility: 'private', status: 'confirmed', creditor_id: ME, amount: 900 }),
      ],
      ME,
    )
    expect(l.agreedNet).toBe(500)
    expect(l.privateNet).toBe(900)
    expect(l.privateItems).toHaveLength(1)
    expect(l.agreedItems).toHaveLength(1)
  })

  it('splits pending by who must act, and keeps only my rejected rows', () => {
    const l = computeFriendLedger(
      [
        debt({ status: 'pending_confirmation', created_by: FRIEND }), // awaiting me
        debt({ status: 'pending_confirmation', created_by: ME }), // awaiting friend
        debt({ status: 'rejected', created_by: ME }), // mine, they rejected
        debt({ status: 'rejected', created_by: FRIEND }), // theirs — not my problem
      ],
      ME,
    )
    expect(l.pendingIncoming).toHaveLength(1)
    expect(l.pendingOutgoing).toHaveLength(1)
    expect(l.rejectedMine).toHaveLength(1)
    expect(l.rejectedMine[0].created_by).toBe(ME)
  })

  it('drops cancelled rows, buckets settled separately, neither hits a total', () => {
    const l = computeFriendLedger(
      [debt({ status: 'cancelled' }), debt({ status: 'settled' }), debt({ visibility: 'private', status: 'settled' })],
      ME,
    )
    expect(l.agreedNet).toBe(0)
    expect(l.privateNet).toBe(0)
    expect(l.agreedItems).toEqual([])
    expect(l.privateItems).toEqual([])
    expect(l.settledItems).toHaveLength(2) // the two settled (shared + private); cancelled dropped
  })
})
