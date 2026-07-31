import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Debt, DebtCreateArgs, FriendConnection, FriendDebtsSummary, Profile } from '@/lib/db'

/**
 * ยอดค้าง data layer. The tables are select-only under RLS and every write goes
 * through a SECURITY DEFINER RPC (0015), so the mutations below call `.rpc(...)`,
 * never `.update(...)`, except display_name (profiles has an own-row UPDATE
 * policy — 0015 §3, no RPC needed).
 *
 * Query keys are shared so one mutation refreshes everything it touches:
 *   ['friend_debts_summary'] the friend list + balances (RPC, all accepted friends)
 *   ['friend_connections']   pending requests in/out
 *   ['debts','pending']      debts awaiting MY confirmation
 *   ['profile']              my own profile row
 *   ['debts_badge']          the single nav-badge count (see useDebtsBadgeCount)
 */

/** Friend list + net balances — one row per accepted friend (cleared or not). */
export function useDebtsSummary() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['friend_debts_summary', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<FriendDebtsSummary[]> => {
      const { data, error } = await supabase.rpc('friend_debts_summary')
      if (error) throw error
      return (data ?? []) as FriendDebtsSummary[]
    },
  })
}

/** Shared debts the OTHER party created that are waiting for me to confirm. RLS
 *  already limits SELECT to shared rows I'm party to; `neq created_by` drops the
 *  ones I created (those wait on THEM, not me). */
export function usePendingDebts() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['debts', 'pending', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Debt[]> => {
      const { data, error } = await supabase
        .from('debts')
        .select('*')
        .eq('status', 'pending_confirmation')
        .eq('visibility', 'shared')
        .neq('created_by', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Debt[]
    },
  })
}

/** A pending request with the OTHER party's identity resolved. Since 0020 the
 *  profiles SELECT policy exposes a counterpart on ANY connection row (not just
 *  accepted), so name + username are known BEFORE accepting — the whole point of
 *  this PR (you accept because you know who it is). */
export interface PendingRequest {
  /** friend_connections.id — pass to friend_request_respond */
  id: string
  counterpartId: string
  displayName: string | null
  username: string | null
}

export interface FriendRequests {
  incoming: PendingRequest[]
  outgoing: PendingRequest[]
}

export function useFriendRequests() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['friend_connections', 'pending', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<FriendRequests> => {
      const uid = user!.id
      const { data, error } = await supabase
        .from('friend_connections')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as FriendConnection[]
      const incoming = rows.filter((r) => r.addressee_id === uid)
      const outgoing = rows.filter((r) => r.requester_id === uid)

      // Resolve each counterpart's profile in one round-trip (no FK from
      // friend_connections to profiles, so this can't be a PostgREST embed).
      const ids = [
        ...new Set([...incoming.map((r) => r.requester_id), ...outgoing.map((r) => r.addressee_id)]),
      ]
      const byId = new Map<string, { display_name: string; username: string | null }>()
      if (ids.length) {
        const { data: profs, error: pe } = await supabase
          .from('profiles')
          .select('user_id, display_name, username')
          .in('user_id', ids)
        if (pe) throw pe
        for (const p of profs ?? []) byId.set(p.user_id, { display_name: p.display_name, username: p.username })
      }
      const toReq = (r: FriendConnection, counterpartId: string): PendingRequest => ({
        id: r.id,
        counterpartId,
        displayName: byId.get(counterpartId)?.display_name ?? null,
        username: byId.get(counterpartId)?.username ?? null,
      })
      return {
        incoming: incoming.map((r) => toReq(r, r.requester_id)),
        outgoing: outgoing.map((r) => toReq(r, r.addressee_id)),
      }
    },
  })
}

/** My own profile (display_name + username). */
export function useOwnProfile() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return (data as Profile) ?? null
    },
  })
}

/**
 * The nav badge count — the ONE place it's computed (convention 10): incoming
 * friend requests awaiting my answer + shared debts awaiting my confirmation.
 * Head-count queries only (no rows fetched), so it's cheap to keep on every
 * screen via <AppLayout>.
 */
export function useDebtsBadgeCount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['debts_badge', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<number> => {
      const uid = user!.id
      const [reqs, debts] = await Promise.all([
        supabase
          .from('friend_connections')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .eq('addressee_id', uid),
        supabase
          .from('debts')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending_confirmation')
          .eq('visibility', 'shared')
          .neq('created_by', uid),
      ])
      if (reqs.error) throw reqs.error
      if (debts.error) throw debts.error
      return (reqs.count ?? 0) + (debts.count ?? 0)
    },
  })
}

export function useSendFriendRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => {
      // friend_request_send raises ready-to-show Thai errors (ไม่พบผู้ใช้นี้,
      // เพิ่มตัวเองเป็นเพื่อนไม่ได้, …) — translateError passes those through.
      const { error } = await supabase.rpc('friend_request_send', { p_username: code })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friend_connections'] })
      qc.invalidateQueries({ queryKey: ['friend_debts_summary'] })
      qc.invalidateQueries({ queryKey: ['debts_badge'] })
    },
  })
}

export function useRespondFriendRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await supabase.rpc('friend_request_respond', {
        p_connection_id: id,
        p_accept: accept,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friend_connections'] })
      qc.invalidateQueries({ queryKey: ['friend_debts_summary'] })
      qc.invalidateQueries({ queryKey: ['debts_badge'] })
    },
  })
}

export function useConfirmDebt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (debtId: string) => {
      const { error } = await supabase.rpc('debt_confirm', { p_debt_id: debtId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debts'] })
      qc.invalidateQueries({ queryKey: ['friend_debts_summary'] })
      qc.invalidateQueries({ queryKey: ['debts_badge'] })
    },
  })
}

export function useRejectDebt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ debtId, reason }: { debtId: string; reason?: string }) => {
      // p_reason is optional — omit it when blank so the SQL DEFAULT (null) applies.
      const args = reason && reason.trim() ? { p_debt_id: debtId, p_reason: reason.trim() } : { p_debt_id: debtId }
      const { error } = await supabase.rpc('debt_reject', args)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debts'] })
      qc.invalidateQueries({ queryKey: ['friend_debts_summary'] })
      qc.invalidateQueries({ queryKey: ['debts_badge'] })
    },
  })
}

export function useUpdateDisplayName() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name })
        .eq('user_id', user.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      // the name rides along in friend_debts_summary rows, so refresh those too.
      qc.invalidateQueries({ queryKey: ['friend_debts_summary'] })
    },
  })
}

/** Set the username once. The DB (0020) enforces set-once + format + uniqueness;
 *  the client only needs to translate the duplicate case. Caught by CODE, never
 *  by message (rule 14); the set-once trigger's own Thai message passes straight
 *  through translateError, so it needs no case here. */
export function useSetUsername() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (username: string) => {
      if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ')
      const { error } = await supabase.from('profiles').update({ username }).eq('user_id', user.id)
      if (error) {
        if (error.code === '23505') throw new Error('ชื่อผู้ใช้นี้มีคนใช้แล้ว')
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['friend_connections'] })
    },
  })
}

/** Every debt between me and one friend, any status/visibility (RLS already
 *  limits it to my own private rows + shared rows I'm party to). The history page
 *  partitions these with computeFriendLedger. */
export function useFriendDebts(friendId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['debts', 'friend', friendId, user?.id],
    enabled: !!user && !!friendId,
    queryFn: async (): Promise<Debt[]> => {
      const uid = user!.id
      const { data, error } = await supabase
        .from('debts')
        .select('*')
        .or(
          `and(creditor_id.eq.${uid},debtor_id.eq.${friendId}),and(creditor_id.eq.${friendId},debtor_id.eq.${uid})`,
        )
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Debt[]
    },
  })
}

/** Invalidate everything a debt write can move. */
function invalidateDebts(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['debts'] }) // covers ['debts','friend',…] and ['debts','pending']
  qc.invalidateQueries({ queryKey: ['friend_debts_summary'] })
  qc.invalidateQueries({ queryKey: ['debts_badge'] })
}

export function useCreateDebt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: DebtCreateArgs) => {
      // debt_create raises ready Thai errors (จำนวนเงินต้องมากกว่า 0, …) — caught
      // by result and passed through translateError, never by message substring.
      const { error } = await supabase.rpc('debt_create', args)
      if (error) throw error
    },
    onSuccess: () => invalidateDebts(qc),
  })
}

/** Turn a private note into a shared debt awaiting the friend's confirmation,
 *  atomically (0018) — never delete+create on the client (would lose the note if
 *  the second call failed). */
export function useSharePrivate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (debtId: string) => {
      const { error } = await supabase.rpc('debt_share_private', { p_debt_id: debtId })
      if (error) throw error
    },
    onSuccess: () => invalidateDebts(qc),
  })
}

/** Remove a debt I created that is still pending or was rejected (0018 widened
 *  debt_cancel to accept rejected rows). */
export function useCancelDebt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (debtId: string) => {
      const { error } = await supabase.rpc('debt_cancel', { p_debt_id: debtId })
      if (error) throw error
    },
    onSuccess: () => invalidateDebts(qc),
  })
}
