import { useEffect, useMemo, useState } from 'react'
import { IconEye, IconEyeOff, IconUserPlus } from '@tabler/icons-react'
import { WovenHeroEmpty } from '@/components/WovenHero'
import { AddFriendSheet } from '@/components/AddFriendSheet'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/hooks/useAuth'
import { useHideBalance } from '@/hooks/useHideBalance'
import {
  useConfirmDebt,
  useDebtsSummary,
  useFriendRequests,
  usePendingDebts,
  useRejectDebt,
} from '@/hooks/useFriends'
import { computeDebtsHeadline, friendDirection } from '@/lib/debtsSummary'
import { formatBaht, MASKED_BAHT } from '@/lib/format'
import { translateError } from '@/lib/errors'
import type { Debt, FriendDebtsSummary } from '@/lib/db'

/**
 * ยอดค้าง — what friends owe you and what you owe them. Every money figure comes
 * pre-summed from `friend_debts_summary` (0017) via computeDebtsHeadline (the one
 * place cross-friend totals are added); this page only lays them out. The single
 * textured element is the woven headline label (design-spec §2 "one per page").
 * Private "จดไว้เอง" notes never appear here — the RPC keeps them in separate
 * columns and the headline reads only the SHARED net.
 */
export function DebtsPage() {
  const { user } = useAuth()
  const summaryQ = useDebtsSummary()
  const pendingQ = usePendingDebts()
  const requestsQ = useFriendRequests()
  const { hideBalance, toggleHideBalance } = useHideBalance()
  const toast = useToast()
  const [addOpen, setAddOpen] = useState(false)

  // Surface query failures — never swallow (convention 17). The pending block is
  // the only channel for a confirmation (no push), so its failure must be loud.
  useEffect(() => {
    if (summaryQ.error) toast.error(`โหลดยอดค้างไม่สำเร็จ: ${translateError(summaryQ.error)}`)
  }, [summaryQ.error, toast])
  useEffect(() => {
    if (pendingQ.error) toast.error(`โหลดรายการที่รอยืนยันไม่สำเร็จ: ${translateError(pendingQ.error)}`)
  }, [pendingQ.error, toast])

  const rows = summaryQ.data ?? []
  const headline = useMemo(() => computeDebtsHeadline(rows), [rows])
  const nameById = useMemo(
    () => new Map(rows.map((r) => [r.friend_id, r.display_name])),
    [rows],
  )
  const friends = useMemo(
    () => [...rows].sort((a, b) => Math.abs(b.shared_net) - Math.abs(a.shared_net)),
    [rows],
  )
  const pending = pendingQ.data ?? []
  const hasIncoming = (requestsQ.data?.incoming.length ?? 0) > 0

  const money = (v: number) => (hideBalance ? MASKED_BAHT : formatBaht(v))

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between px-[18px] pb-3.5 pt-[18px]">
        <p className="text-[17px] font-medium">ยอดค้าง</p>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          aria-label="เพิ่มเพื่อน"
          className="relative flex h-11 w-11 items-center justify-center rounded-full active:bg-fill"
        >
          <IconUserPlus size={20} className="text-brand-deep" />
          {hasIncoming && (
            <span
              aria-hidden
              className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-expense ring-2 ring-white"
            />
          )}
        </button>
      </div>

      {summaryQ.isLoading ? (
        <div className="mx-4 h-[112px] animate-pulse rounded-card bg-fill motion-reduce:animate-none" />
      ) : rows.length === 0 ? (
        <div className="px-4">
          <WovenHeroEmpty
            eyebrow="ยอดค้าง"
            title="ยังไม่มีเพื่อนในยอดค้าง"
            description={
              <>
                จดว่าใครค้างคุณ คุณค้างใคร แล้วเคลียร์ให้จบ
                <br />
                เพิ่มได้เฉพาะเพื่อนที่มีบัญชี Stash อยู่แล้ว
              </>
            }
            actionLabel="เพิ่มเพื่อน"
            onAction={() => setAddOpen(true)}
          />
        </div>
      ) : (
        <>
          {/* headline — the one woven label on this page */}
          <div className="mx-4 mb-4">
            <div className="woven relative overflow-hidden rounded-card bg-brand-fabric text-brand-thread shadow-card">
              <span aria-hidden className="selvedge absolute inset-x-0 top-0 h-[6px]" />
              <span aria-hidden className="selvedge absolute inset-x-0 bottom-0 h-[6px]" />
              <div className="relative px-[18px] py-4">
                <div className="flex items-start justify-between">
                  <p
                    className="text-[10px] font-medium uppercase opacity-70"
                    style={{ letterSpacing: '0.16em' }}
                  >
                    คนอื่นค้างคุณ
                  </p>
                  <button
                    type="button"
                    onClick={toggleHideBalance}
                    aria-label={hideBalance ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน'}
                    className="-m-1.5 flex h-8 w-8 items-center justify-center rounded-full text-brand-thread/80"
                  >
                    {hideBalance ? <IconEyeOff size={17} /> : <IconEye size={17} />}
                  </button>
                </div>
                <p className="mt-1 text-[30px] font-medium leading-tight tabular-nums">
                  {money(headline.theyOweMe)}
                </p>
                <p className="mt-1.5 text-[12.5px] opacity-85">
                  คุณค้างคนอื่น {money(headline.iOweThem)} · เพื่อน {headline.friendCount} คน
                </p>
              </div>
            </div>
          </div>

          {/* awaiting my confirmation — the only channel there is (no push) */}
          {pending.length > 0 && (
            <div className="mx-4 mb-4">
              <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">รอคุณยืนยัน</p>
              <div className="overflow-hidden rounded-card border-[0.5px] border-hairline">
                {pending.map((d) => (
                  <PendingDebtRow
                    key={d.id}
                    debt={d}
                    meIsCreditor={!!user && d.creditor_id === user.id}
                    counterpartName={
                      nameById.get(d.creditor_id === user?.id ? d.debtor_id : d.creditor_id) ??
                      'เพื่อน'
                    }
                    hideBalance={hideBalance}
                  />
                ))}
              </div>
            </div>
          )}

          {/* friend list */}
          <div className="mx-4 pb-6">
            <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">เพื่อน</p>
            {friends.map((f) => (
              <FriendRow key={f.friend_id} friend={f} hideBalance={hideBalance} />
            ))}
          </div>
        </>
      )}

      {addOpen && <AddFriendSheet onClose={() => setAddOpen(false)} />}
    </div>
  )
}

/** One friend: name + net direction as a sentence (colour reinforces, never
 *  replaces, the word — so direction reads without relying on colour). */
function FriendRow({ friend, hideBalance }: { friend: FriendDebtsSummary; hideBalance: boolean }) {
  const dir = friendDirection(friend.shared_net)
  const amount = hideBalance ? MASKED_BAHT : formatBaht(Math.abs(friend.shared_net))
  const initial = friend.display_name.trim().charAt(0) || '?'

  const text =
    dir === 'owes_me' ? `ค้างคุณ ${amount}` : dir === 'i_owe' ? `คุณค้าง ${amount}` : 'เคลียร์แล้ว'
  const tone =
    dir === 'owes_me' ? 'text-income' : dir === 'i_owe' ? 'text-expense' : 'text-faint'

  return (
    <div className="flex items-center gap-3 border-b-[0.5px] border-hairline py-3 last:border-b-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill text-[14px] font-medium text-muted">
        {initial}
      </div>
      <p className="min-w-0 flex-1 truncate text-[14px]">{friend.display_name}</p>
      <span className={`shrink-0 text-[14px] font-medium ${tone}`}>{text}</span>
    </div>
  )
}

/** A shared debt the other party logged, waiting for me to confirm or reject.
 *  The amount is shown (not masked): you can't agree to a figure you can't see. */
function PendingDebtRow({
  debt,
  meIsCreditor,
  counterpartName,
  hideBalance,
}: {
  debt: Debt
  meIsCreditor: boolean
  counterpartName: string
  hideBalance: boolean
}) {
  const confirm = useConfirmDebt()
  const reject = useRejectDebt()
  const toast = useToast()
  const busy = confirm.isPending || reject.isPending

  const amount = hideBalance ? MASKED_BAHT : formatBaht(debt.amount)
  const line = meIsCreditor
    ? `${counterpartName} บันทึกว่าค้างคุณ ${amount}`
    : `${counterpartName} บันทึกว่าคุณค้าง ${amount}`

  async function act(accept: boolean) {
    try {
      if (accept) await confirm.mutateAsync(debt.id)
      else await reject.mutateAsync(debt.id)
      toast.success(accept ? 'ยืนยันแล้ว' : 'ปฏิเสธแล้ว')
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  return (
    <div className="border-b-[0.5px] border-hairline p-3 last:border-b-0">
      <p className="text-[13.5px]">{line}</p>
      {debt.reason && <p className="mt-0.5 text-[11px] text-faint">{debt.reason}</p>}
      <div className="mt-2.5 flex gap-2">
        <button
          disabled={busy}
          onClick={() => act(true)}
          className="flex-1 rounded-btn bg-brand-deep py-2 text-[12.5px] font-medium text-white disabled:opacity-40"
        >
          ยืนยัน
        </button>
        <button
          disabled={busy}
          onClick={() => act(false)}
          className="rounded-btn border-[0.5px] border-hairline px-4 py-2 text-[12.5px] font-medium text-expense disabled:opacity-40"
        >
          ปฏิเสธ
        </button>
      </div>
    </div>
  )
}
