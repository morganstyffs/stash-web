/**
 * ยอดค้าง — the ONE place money from `friend_debts_summary` is aggregated for the
 * screen (convention 3 / 10). The RPC already returns, per accepted friend, the
 * SHARED and PRIVATE totals split by direction and a signed net; this file only
 * sums across friends and reads a net's sign. No amount is recomputed from parts
 * here — `shared_net` comes straight from SQL (see 0017).
 *
 * Why net-within-friend but gross-across-friends: with one friend you reconcile
 * to a single net ("you owe me ฿300 after everything"). Across friends those
 * don't cancel — a friend owing you doesn't pay off what you owe someone else —
 * so the headline shows two gross figures, never one blended net (that number
 * answers nothing you can act on; see the PR brief).
 */
import type { FriendDebtsSummary } from '@/lib/db'

export interface DebtsHeadline {
  /** SHARED only: total others owe me — Σ of each friend's positive net. */
  theyOweMe: number
  /** SHARED only: total I owe others — Σ of each friend's |negative net|. */
  iOweThem: number
  /** accepted friends (every row is one accepted friend, cleared or not). */
  friendCount: number
}

export function computeDebtsHeadline(rows: FriendDebtsSummary[]): DebtsHeadline {
  let theyOweMe = 0
  let iOweThem = 0
  for (const r of rows) {
    if (r.shared_net > 0) theyOweMe += r.shared_net
    else if (r.shared_net < 0) iOweThem += -r.shared_net
  }
  return { theyOweMe, iOweThem, friendCount: rows.length }
}

/** Direction of a friend's SHARED net, from the caller's point of view. Colour
 *  and wording both derive from this so the two never disagree. */
export type FriendDirection = 'owes_me' | 'i_owe' | 'clear'

export function friendDirection(sharedNet: number): FriendDirection {
  if (sharedNet > 0) return 'owes_me'
  if (sharedNet < 0) return 'i_owe'
  return 'clear'
}
