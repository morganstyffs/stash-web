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
import type { Debt, FriendDebtsSummary } from '@/lib/db'

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

// ── per-friend ledger (history page) ─────────────────────────────────────────

/**
 * Partition every debt with one friend into the blocks the history page shows,
 * and total the two that carry a balance — SEPARATELY. The "ตกลงกันแล้ว" (agreed)
 * total and the "จดไว้เอง" (private) total are NEVER added together: a private
 * note is invisible to the other side, so a blended figure would be a number the
 * friend can't reconcile. This is the one place these per-friend sums live
 * (convention 3); the agreed net matches friend_debts_summary.shared_net (both
 * are confirmed shared debts, same sign convention), so the list and the summary
 * page never disagree. cancelled/settled rows fall through into no block.
 */
export interface FriendLedger {
  agreedNet: number
  agreedItems: Debt[]
  privateNet: number
  privateItems: Debt[]
  /** shared, awaiting MY confirmation (the other party created it). */
  pendingIncoming: Debt[]
  /** shared, awaiting THE FRIEND's confirmation (I created it). */
  pendingOutgoing: Debt[]
  /** shared, I created, the friend rejected — mine to resend or delete. */
  rejectedMine: Debt[]
}

/** A debt's signed contribution from my point of view: + when the friend owes me
 *  (I'm the creditor), − when I owe the friend. */
function signedForMe(d: Debt, myUid: string): number {
  return d.creditor_id === myUid ? d.amount : -d.amount
}

export function computeFriendLedger(debts: Debt[], myUid: string): FriendLedger {
  const l: FriendLedger = {
    agreedNet: 0,
    agreedItems: [],
    privateNet: 0,
    privateItems: [],
    pendingIncoming: [],
    pendingOutgoing: [],
    rejectedMine: [],
  }
  for (const d of debts) {
    if (d.visibility === 'private') {
      // private notes are created 'confirmed' and only the author sees them.
      if (d.status === 'confirmed') {
        l.privateItems.push(d)
        l.privateNet += signedForMe(d, myUid)
      }
      continue
    }
    // shared
    switch (d.status) {
      case 'confirmed':
        l.agreedItems.push(d)
        l.agreedNet += signedForMe(d, myUid)
        break
      case 'pending_confirmation':
        if (d.created_by === myUid) l.pendingOutgoing.push(d)
        else l.pendingIncoming.push(d)
        break
      case 'rejected':
        if (d.created_by === myUid) l.rejectedMine.push(d)
        break
      // 'cancelled' / 'settled' → shown nowhere on this page
    }
  }
  return l
}
