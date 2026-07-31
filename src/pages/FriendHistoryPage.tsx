import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconArrowBackUp, IconChevronLeft, IconPlus, IconSend } from '@tabler/icons-react'
import { useToast } from '@/components/Toast'
import { ConfirmDebtSheet } from '@/components/ConfirmDebtSheet'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DebtFormSheet, type DebtFormPrefill } from '@/components/DebtFormSheet'
import { SettleSheet } from '@/components/SettleSheet'
import { useAuth } from '@/hooks/useAuth'
import { useHideBalance } from '@/hooks/useHideBalance'
import {
  useCancelDebt,
  useDebtsSummary,
  useFriendDebts,
  useReverseSettle,
  useSharePrivate,
} from '@/hooks/useFriends'
import { computeFriendLedger } from '@/lib/debtsSummary'
import { formatBaht, formatDueDate, MASKED_BAHT } from '@/lib/format'
import { translateError } from '@/lib/errors'
import type { Debt } from '@/lib/db'

/**
 * ยอดค้างรายคน — everything with one friend, in blocks that never blend. The
 * "ตกลงกันแล้ว" total (confirmed, both sides can see) and the "จดไว้เอง" total
 * (private, only I see) are shown as two separate figures and NEVER summed: a
 * private note the friend can't see must not silently inflate the number I'd
 * quote them. The one textured element is the agreed-total woven label
 * (design-spec §2). Amounts are masked on a glance per hideBalance; the confirm
 * SHEET reveals them (decision, not glance).
 */
export function FriendHistoryPage() {
  const { friendId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { hideBalance } = useHideBalance()
  const summaryQ = useDebtsSummary()
  const debtsQ = useFriendDebts(friendId)
  const toast = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [prefill, setPrefill] = useState<DebtFormPrefill | undefined>(undefined)
  const [confirming, setConfirming] = useState<Debt | null>(null)
  const [settling, setSettling] = useState<Debt[] | null>(null)
  const [reversing, setReversing] = useState<Debt | null>(null)

  useEffect(() => {
    if (debtsQ.error) toast.error(`โหลดรายการไม่สำเร็จ: ${translateError(debtsQ.error)}`)
  }, [debtsQ.error, toast])

  const friendName =
    summaryQ.data?.find((r) => r.friend_id === friendId)?.display_name ?? 'เพื่อน'
  const ledger = useMemo(
    () => computeFriendLedger(debtsQ.data ?? [], user?.id ?? ''),
    [debtsQ.data, user?.id],
  )
  const money = (v: number) => (hideBalance ? MASKED_BAHT : formatBaht(v))
  const myUid = user?.id ?? ''

  const reverse = useReverseSettle()

  function openCreate(pref?: DebtFormPrefill) {
    setPrefill(pref)
    setFormOpen(true)
  }

  async function doReverse() {
    if (!reversing) return
    try {
      await reverse.mutateAsync(reversing.id)
      toast.success('ย้อนการเคลียร์แล้ว')
      setReversing(null)
    } catch (e) {
      toast.error(translateError(e))
      setReversing(null)
    }
  }

  /** Open the normal add flow, prefilled to log MY side of a settlement the
   *  friend recorded (I'm the opposite party: debtor pays → expense, creditor
   *  receives → income). An invitation, skippable, nothing left pending. */
  function logMyEntry(d: Debt) {
    const iAmDebtor = d.debtor_id === myUid
    navigate('/add', {
      state: {
        prefill: {
          type: iAmDebtor ? 'expense' : 'income',
          amount: d.amount,
          note: d.reason || `เคลียร์ยอดกับ${friendName}`,
        },
      },
    })
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-1 px-2 pb-3.5 pt-[18px]">
        <button
          type="button"
          onClick={() => navigate('/debts')}
          aria-label="กลับ"
          className="flex h-11 w-11 items-center justify-center rounded-full active:bg-fill"
        >
          <IconChevronLeft size={22} className="text-muted" />
        </button>
        <p className="flex-1 truncate text-[17px] font-medium">{friendName}</p>
        <button
          type="button"
          onClick={() => openCreate(undefined)}
          aria-label="บันทึกยอดค้าง"
          className="flex h-11 w-11 items-center justify-center rounded-full active:bg-fill"
        >
          <IconPlus size={22} className="text-brand-deep" />
        </button>
      </div>

      {debtsQ.isLoading ? (
        <div className="mx-4 h-[96px] animate-pulse rounded-card bg-fill motion-reduce:animate-none" />
      ) : (
        <div className="pb-8">
          {/* awaiting action (no push notifications — this is the only signal) */}
          {(ledger.pendingIncoming.length > 0 || ledger.pendingOutgoing.length > 0) && (
            <Section title="รอยืนยัน">
              {ledger.pendingIncoming.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setConfirming(d)}
                  className="flex w-full items-center gap-3 border-b-[0.5px] border-hairline py-3 text-left last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px]">{directionText(d, myUid, friendName)}</p>
                    <p className="text-[11px] text-warn-ink">แตะเพื่อยืนยัน / ปฏิเสธ</p>
                  </div>
                  <span className="shrink-0 text-[13.5px] tabular-nums text-muted">{money(d.amount)}</span>
                </button>
              ))}
              {ledger.pendingOutgoing.map((d) => (
                <OutgoingRow
                  key={d.id}
                  debt={d}
                  friendName={friendName}
                  myUid={myUid}
                  money={money}
                />
              ))}
            </Section>
          )}

          {/* rejected — mine to resend or delete, never counted in any total */}
          {ledger.rejectedMine.length > 0 && (
            <Section title="ถูกปฏิเสธ">
              {ledger.rejectedMine.map((d) => (
                <RejectedRow
                  key={d.id}
                  debt={d}
                  myUid={myUid}
                  friendName={friendName}
                  money={money}
                  onResend={() => openCreate(prefillFrom(d, myUid))}
                />
              ))}
            </Section>
          )}

          {/* agreed — the number you can quote the friend. The one woven label. */}
          <div className="mx-4 mb-2 mt-2">
            <div className="woven relative overflow-hidden rounded-card bg-brand-fabric text-brand-thread shadow-card">
              <span aria-hidden className="selvedge absolute inset-x-0 top-0 h-[6px]" />
              <span aria-hidden className="selvedge absolute inset-x-0 bottom-0 h-[6px]" />
              <div className="relative px-[18px] py-4">
                <p className="text-[10px] font-medium uppercase opacity-70" style={{ letterSpacing: '0.16em' }}>
                  ตกลงกันแล้ว
                </p>
                <p className="mt-1 text-[28px] font-medium leading-tight tabular-nums">
                  {money(Math.abs(ledger.agreedNet))}
                </p>
                <p className="mt-1 text-[12.5px] opacity-85">{netSentence(ledger.agreedNet, friendName)}</p>
              </div>
            </div>
          </div>
          {ledger.agreedItems.length > 0 ? (
            <div className="mx-4 mb-2">
              {ledger.agreedItems.map((d) => (
                <ItemRow key={d.id} debt={d} myUid={myUid} friendName={friendName} money={money} />
              ))}
              <button
                type="button"
                onClick={() => setSettling(ledger.agreedItems)}
                className="mt-2.5 w-full rounded-btn bg-brand-deep py-2.5 text-[13px] font-medium text-white"
              >
                เคลียร์ทั้งหมด
              </button>
            </div>
          ) : (
            // only when there IS other activity — a wholly-empty page shows the
            // single prompt at the bottom instead of three "empty" lines.
            (debtsQ.data?.length ?? 0) > 0 && (
              <p className="mx-4 mb-2 py-3 text-[12.5px] text-faint">ยังไม่มีรายการที่ตกลงกัน</p>
            )
          )}

          {/* private — my own notes, separate total, dashed = not sent to friend */}
          {ledger.privateItems.length > 0 && (
            <Section title="จดไว้เอง">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[12px] text-faint">ยอดรวมที่จดไว้เอง</span>
                <span className="text-[15px] font-medium tabular-nums">
                  {money(Math.abs(ledger.privateNet))}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {ledger.privateItems.map((d) => (
                  <PrivateRow
                    key={d.id}
                    debt={d}
                    myUid={myUid}
                    friendName={friendName}
                    money={money}
                    onSettle={() => setSettling([d])}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* settled — closed items; reverse (mine) or a nudge to log mine (theirs) */}
          {ledger.settledItems.length > 0 && (
            <Section title="เคลียร์แล้ว">
              {ledger.settledItems.map((d) => (
                <SettledRow
                  key={d.id}
                  debt={d}
                  myUid={myUid}
                  friendName={friendName}
                  money={money}
                  onReverse={() => setReversing(d)}
                  onLogMine={() => logMyEntry(d)}
                />
              ))}
            </Section>
          )}

          {debtsQ.data?.length === 0 && (
            <p className="mx-4 mt-2 text-[13px] text-faint">
              ยังไม่มีรายการกับ{friendName} — แตะ + เพื่อบันทึกยอดแรก
            </p>
          )}
        </div>
      )}

      {formOpen && (
        <DebtFormSheet
          friendId={friendId}
          friendName={friendName}
          prefill={prefill}
          onClose={() => setFormOpen(false)}
        />
      )}
      {confirming && (
        <ConfirmDebtSheet
          debt={confirming}
          counterpartName={friendName}
          meIsCreditor={confirming.creditor_id === myUid}
          onClose={() => setConfirming(null)}
        />
      )}
      {settling && (
        <SettleSheet
          debts={settling}
          friendName={friendName}
          myUid={myUid}
          onClose={() => setSettling(null)}
        />
      )}
      {reversing && (
        <ConfirmDialog
          title="ย้อนการเคลียร์?"
          message="รายการเงินที่สร้างจากการเคลียร์จะถูกลบ และยอดนี้จะกลับมาเป็นค้างอยู่"
          confirmLabel="ย้อนการเคลียร์"
          busyLabel="กำลังย้อน…"
          busy={reverse.isPending}
          onCancel={() => setReversing(null)}
          onConfirm={doReverse}
        />
      )}
    </div>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Direction as a sentence with the friend's name, from my point of view. */
function directionText(d: Debt, myUid: string, friendName: string): string {
  return d.creditor_id === myUid ? `${friendName}ค้างคุณ` : `คุณค้าง${friendName}`
}

/** Signed net → a sentence naming who owes whom (or cleared). */
function netSentence(net: number, friendName: string): string {
  if (net > 0) return `${friendName}ค้างคุณ`
  if (net < 0) return `คุณค้าง${friendName}`
  return 'เคลียร์แล้ว'
}

function prefillFrom(d: Debt, myUid: string): DebtFormPrefill {
  return {
    direction: d.creditor_id === myUid ? 'they_owe' : 'i_owe',
    amount: String(d.amount),
    reason: d.reason ?? '',
    dueDate: d.due_date ?? '',
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-4 mb-3 mt-2">
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">{title}</p>
      {children}
    </div>
  )
}

/** A confirmed/agreed line: direction sentence + amount, coloured by direction
 *  (word carries the meaning too). */
function ItemRow({
  debt,
  myUid,
  friendName,
  money,
}: {
  debt: Debt
  myUid: string
  friendName: string
  money: (v: number) => string
}) {
  const owesMe = debt.creditor_id === myUid
  return (
    <div className="flex items-center gap-3 border-b-[0.5px] border-hairline py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px]">{debt.reason || directionText(debt, myUid, friendName)}</p>
        <p className="text-[11px] text-faint">
          {directionText(debt, myUid, friendName)}
          {debt.due_date ? ` · กำหนดคืน ${formatDueDate(debt.due_date)}` : ''}
        </p>
      </div>
      <span className={`shrink-0 text-[14px] font-medium tabular-nums ${owesMe ? 'text-income' : 'text-expense'}`}>
        {money(debt.amount)}
      </span>
    </div>
  )
}

/** A shared debt I sent that the friend hasn't answered yet. */
function OutgoingRow({
  debt,
  friendName,
  myUid,
  money,
}: {
  debt: Debt
  friendName: string
  myUid: string
  money: (v: number) => string
}) {
  const cancel = useCancelDebt()
  const toast = useToast()
  async function doCancel() {
    try {
      await cancel.mutateAsync(debt.id)
      toast.success('ยกเลิกแล้ว')
    } catch (e) {
      toast.error(translateError(e))
    }
  }
  return (
    <div className="flex items-center gap-3 border-b-[0.5px] border-hairline py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px]">{directionText(debt, myUid, friendName)}</p>
        <p className="text-[11px] text-warn-ink">รอ{friendName}ยืนยัน</p>
      </div>
      <span className="shrink-0 text-[13.5px] tabular-nums text-muted">{money(debt.amount)}</span>
      <button
        onClick={doCancel}
        disabled={cancel.isPending}
        className="shrink-0 rounded-btn border-[0.5px] border-hairline px-3 py-1.5 text-[12px] text-muted disabled:opacity-40"
      >
        ยกเลิก
      </button>
    </div>
  )
}

/** A shared debt the friend rejected — resend (prefilled) or delete. */
function RejectedRow({
  debt,
  myUid,
  friendName,
  money,
  onResend,
}: {
  debt: Debt
  myUid: string
  friendName: string
  money: (v: number) => string
  onResend: () => void
}) {
  const cancel = useCancelDebt()
  const toast = useToast()
  async function doDelete() {
    try {
      await cancel.mutateAsync(debt.id)
      toast.success('ลบแล้ว')
    } catch (e) {
      toast.error(translateError(e))
    }
  }
  return (
    <div className="border-b-[0.5px] border-hairline py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px]">{directionText(debt, myUid, friendName)}</p>
          <p className="text-[11px] text-expense">
            {friendName}ปฏิเสธ{debt.rejected_reason ? ` · ${debt.rejected_reason}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-[13.5px] tabular-nums text-muted line-through">{money(debt.amount)}</span>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={onResend}
          className="rounded-btn bg-brand-deep px-4 py-1.5 text-[12px] font-medium text-white"
        >
          ส่งใหม่
        </button>
        <button
          onClick={doDelete}
          disabled={cancel.isPending}
          className="rounded-btn border-[0.5px] border-hairline px-4 py-1.5 text-[12px] text-expense disabled:opacity-40"
        >
          ลบ
        </button>
      </div>
    </div>
  )
}

/** A private note — visible only to me until shared. Set apart with an inset
 *  `fill` background + an explicit "จดไว้เอง" label (NOT a dashed border: dashed
 *  is already used for photo/placeholder zones elsewhere, so a new dashed meaning
 *  would be exactly the drift the brief warns against). Each can be promoted to a
 *  shared debt (0018, atomic). */
function PrivateRow({
  debt,
  myUid,
  friendName,
  money,
  onSettle,
}: {
  debt: Debt
  myUid: string
  friendName: string
  money: (v: number) => string
  onSettle: () => void
}) {
  const share = useSharePrivate()
  const toast = useToast()
  const owesMe = debt.creditor_id === myUid
  async function doShare() {
    try {
      await share.mutateAsync(debt.id)
      toast.success(`ส่งให้${friendName}ยืนยันแล้ว`)
    } catch (e) {
      toast.error(translateError(e))
    }
  }
  return (
    <div className="rounded-card border-[0.5px] border-hairline bg-fill p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px]">
            {debt.reason || directionText(debt, myUid, friendName)}
          </p>
          <p className="text-[11px] text-faint">{directionText(debt, myUid, friendName)} · จดไว้เอง (เห็นคนเดียว)</p>
        </div>
        <span className={`shrink-0 text-[14px] font-medium tabular-nums ${owesMe ? 'text-income' : 'text-expense'}`}>
          {money(debt.amount)}
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={doShare}
          disabled={share.isPending}
          className="flex items-center gap-1.5 rounded-btn bg-brand-tint px-3 py-1.5 text-[12px] font-medium text-brand-ink disabled:opacity-40"
        >
          <IconSend size={13} />
          ส่งให้{friendName}ยืนยัน
        </button>
        <button
          onClick={onSettle}
          className="rounded-btn border-[0.5px] border-hairline px-3 py-1.5 text-[12px] font-medium text-muted"
        >
          เคลียร์
        </button>
      </div>
    </div>
  )
}

/** A settled (closed) item. If I settled it, I can reverse it. If the friend
 *  settled a shared one, I'm nudged — not warned — to log my own matching entry;
 *  the app never creates a money row for me silently (0015 §4). */
function SettledRow({
  debt,
  myUid,
  friendName,
  money,
  onReverse,
  onLogMine,
}: {
  debt: Debt
  myUid: string
  friendName: string
  money: (v: number) => string
  onReverse: () => void
  onLogMine: () => void
}) {
  const iSettled = debt.settled_by === myUid
  return (
    <div className="border-b-[0.5px] border-hairline py-2.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px]">{debt.reason || directionText(debt, myUid, friendName)}</p>
          <p className="text-[11px] text-faint">
            {iSettled ? 'คุณกดเคลียร์แล้ว' : `${friendName}เคลียร์แล้ว`}
          </p>
        </div>
        <span className="shrink-0 text-[13.5px] tabular-nums text-muted">{money(debt.amount)}</span>
      </div>
      {iSettled ? (
        <button
          onClick={onReverse}
          className="mt-2 flex items-center gap-1.5 rounded-btn border-[0.5px] border-hairline px-3 py-1.5 text-[12px] font-medium text-muted"
        >
          <IconArrowBackUp size={13} />
          ย้อนการเคลียร์
        </button>
      ) : (
        <button
          onClick={onLogMine}
          className="mt-2 rounded-btn bg-brand-tint px-3 py-1.5 text-[12px] font-medium text-brand-ink"
        >
          บันทึกรายการเงินของคุณ
        </button>
      )}
    </div>
  )
}
