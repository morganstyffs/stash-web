import { useState } from 'react'
import { Overlay } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { translateError } from '@/lib/errors'
import { useConfirmDebt, useRejectDebt } from '@/hooks/useFriends'
import { formatBaht, formatDueDate } from '@/lib/format'
import type { Debt } from '@/lib/db'

/**
 * Confirm or reject a shared debt the other party logged. The amount is shown in
 * full, ALWAYS — deliberately NOT masked by hideBalance. hideBalance hides money
 * on a glance (lists, headline); here the user is being asked to AGREE that they
 * owe (or are owed) a specific sum, and agreeing to a hidden number is accepting
 * a commitment blind, not privacy. "ซ่อนตอนกวาดตา เปิดตอนตัดสินใจ."
 */
export function ConfirmDebtSheet({
  debt,
  counterpartName,
  meIsCreditor,
  onClose,
}: {
  debt: Debt
  counterpartName: string
  meIsCreditor: boolean
  onClose: () => void
}) {
  const confirm = useConfirmDebt()
  const reject = useRejectDebt()
  const toast = useToast()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const busy = confirm.isPending || reject.isPending

  const line = meIsCreditor
    ? `${counterpartName} บันทึกว่าค้างคุณ`
    : `${counterpartName} บันทึกว่าคุณค้างเขา`

  async function doConfirm() {
    try {
      await confirm.mutateAsync(debt.id)
      toast.success('ยืนยันแล้ว')
      onClose()
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  async function doReject() {
    try {
      await reject.mutateAsync({ debtId: debt.id, reason })
      toast.success('ปฏิเสธแล้ว')
      onClose()
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  return (
    <Overlay title="ยืนยันยอดค้าง" onClose={onClose}>
      <p className="text-[13.5px] text-muted">{line}</p>
      {/* amount — always visible, never masked (see file header) */}
      <p className="mt-1 text-[32px] font-medium leading-tight tabular-nums">
        {formatBaht(debt.amount)}
      </p>
      {debt.reason && <p className="mt-1.5 text-[13px]">{debt.reason}</p>}
      {debt.due_date && (
        <p className="mt-0.5 text-[11px] text-faint">กำหนดคืน {formatDueDate(debt.due_date)}</p>
      )}

      {!rejecting ? (
        <div className="mt-6 flex gap-2">
          <button
            disabled={busy}
            onClick={doConfirm}
            className="flex-1 rounded-btn bg-brand-deep py-2.5 text-[14px] font-medium text-white disabled:opacity-40"
          >
            ยืนยัน
          </button>
          <button
            disabled={busy}
            onClick={() => setRejecting(true)}
            className="rounded-btn border-[0.5px] border-hairline px-5 py-2.5 text-[14px] font-medium text-expense disabled:opacity-40"
          >
            ปฏิเสธ
          </button>
        </div>
      ) : (
        <div className="mt-6">
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">
            เหตุผล (ไม่บังคับ)
          </p>
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น จำนวนไม่ตรง"
            maxLength={140}
            className="mb-3 w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[14px] outline-none focus:border-brand"
          />
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={() => setRejecting(false)}
              className="rounded-btn border-[0.5px] border-hairline px-4 py-2.5 text-[13px] font-medium disabled:opacity-40"
            >
              ย้อนกลับ
            </button>
            <button
              disabled={busy}
              onClick={doReject}
              className="flex-1 rounded-btn bg-expense py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
            >
              ยืนยันการปฏิเสธ
            </button>
          </div>
        </div>
      )}
    </Overlay>
  )
}
