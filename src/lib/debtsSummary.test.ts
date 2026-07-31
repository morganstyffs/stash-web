import { describe, it, expect } from 'vitest'
import { computeDebtsHeadline, friendDirection } from '@/lib/debtsSummary'
import type { FriendDebtsSummary } from '@/lib/db'

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
