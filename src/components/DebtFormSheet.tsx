import { useState } from 'react'
import { IconCheck } from '@tabler/icons-react'
import { Overlay } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { translateError } from '@/lib/errors'
import { useAuth } from '@/hooks/useAuth'
import { useCreateDebt } from '@/hooks/useFriends'

export type DebtDirection = 'they_owe' | 'i_owe'

export interface DebtFormPrefill {
  direction: DebtDirection
  amount: string
  reason: string
  dueDate: string
}

/**
 * Log a new balance with one friend. Direction is chosen as a full sentence with
 * the friend's name in it (never accounting words like creditor/debtor). The two
 * modes are cards that spell out the OUTCOME, because they behave very
 * differently: a shared debt shows on neither side until the friend confirms
 * (debt_create sets any shared row to pending, and the creator can't self-confirm
 * — 0015), while a private note is visible only to you. Surfacing "จดไว้เอง" as a
 * card here — not hidden behind a toggle — is deliberate: someone logging
 * "คุณค้างเพื่อน" who needs it recorded no matter what must see that option at
 * entry time, not discover later that a shared note went nowhere.
 */
export function DebtFormSheet({
  friendId,
  friendName,
  prefill,
  onClose,
}: {
  friendId: string
  friendName: string
  prefill?: DebtFormPrefill
  onClose: () => void
}) {
  const { user } = useAuth()
  const create = useCreateDebt()
  const toast = useToast()
  const [direction, setDirection] = useState<DebtDirection | null>(prefill?.direction ?? null)
  const [amount, setAmount] = useState(prefill?.amount ?? '')
  const [reason, setReason] = useState(prefill?.reason ?? '')
  const [dueDate, setDueDate] = useState(prefill?.dueDate ?? '')
  const [mode, setMode] = useState<'shared' | 'private'>('shared')

  const amountNum = Number(amount)
  const canSave = !!direction && Number.isFinite(amountNum) && amountNum > 0 && !create.isPending

  async function save() {
    if (!user || !direction) return
    // they_owe → friend is the creditor's counterpart (I'm creditor); i_owe → reverse.
    const creditorId = direction === 'they_owe' ? user.id : friendId
    const debtorId = direction === 'they_owe' ? friendId : user.id
    try {
      await create.mutateAsync({
        p_creditor_id: creditorId,
        p_debtor_id: debtorId,
        p_amount: amountNum,
        p_private: mode === 'private',
        ...(reason.trim() ? { p_reason: reason.trim() } : {}),
        ...(dueDate ? { p_due_date: dueDate } : {}),
      })
      toast.success(mode === 'private' ? 'จดไว้แล้ว' : `ส่งให้${friendName}ยืนยันแล้ว`)
      onClose()
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  return (
    <Overlay title="บันทึกยอดค้าง" onClose={onClose}>
      {/* direction — full sentences, name inside */}
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">ใครค้างใคร</p>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <DirButton
          active={direction === 'they_owe'}
          onClick={() => setDirection('they_owe')}
          label={`${friendName}ค้างคุณ`}
        />
        <DirButton
          active={direction === 'i_owe'}
          onClick={() => setDirection('i_owe')}
          label={`คุณค้าง${friendName}`}
        />
      </div>

      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">จำนวนเงิน</p>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
        inputMode="decimal"
        placeholder="0"
        className="mb-4 w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[18px] tabular-nums outline-none focus:border-brand"
      />

      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">เรื่องอะไร (ไม่บังคับ)</p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="เช่น ค่าข้าว"
        maxLength={140}
        className="mb-4 w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[14px] outline-none focus:border-brand"
      />

      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">กำหนดคืน (ไม่บังคับ)</p>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="mb-5 w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[14px] outline-none focus:border-brand"
      />

      {/* mode — cards describing the outcome, not a checkbox */}
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">โหมด</p>
      <div className="mb-6 flex flex-col gap-2">
        <ModeCard
          active={mode === 'shared'}
          onClick={() => setMode('shared')}
          title={`ส่งให้${friendName}ยืนยัน`}
          desc={`ขึ้นยอดทั้งสองฝั่งเมื่อ${friendName}กดยืนยัน · จนกว่าจะยืนยันจะขึ้น "รอ${friendName}ยืนยัน"`}
        />
        <ModeCard
          active={mode === 'private'}
          onClick={() => setMode('private')}
          title="จดไว้เอง"
          desc={`${friendName}ไม่เห็นรายการนี้ เก็บไว้ดูเอง — ส่งให้ยืนยันภายหลังได้`}
        />
      </div>

      <button
        disabled={!canSave}
        onClick={save}
        className="w-full rounded-btn bg-brand-deep py-2.5 text-[14px] font-medium text-white disabled:opacity-40"
      >
        {mode === 'private' ? 'จดไว้เอง' : `ส่งให้${friendName}ยืนยัน`}
      </button>
    </Overlay>
  )
}

function DirButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-btn border-[0.5px] px-3 py-2.5 text-[13px] font-medium ${
        active ? 'border-brand bg-brand-tint text-brand-ink' : 'border-hairline text-muted'
      }`}
    >
      {label}
    </button>
  )
}

function ModeCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-2.5 rounded-card border-[0.5px] p-3 text-left ${
        active ? 'border-brand bg-brand-tint' : 'border-hairline'
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          active ? 'border-brand-deep bg-brand-deep text-white' : 'border-chevron text-transparent'
        }`}
      >
        <IconCheck size={11} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-faint">{desc}</span>
      </span>
    </button>
  )
}
