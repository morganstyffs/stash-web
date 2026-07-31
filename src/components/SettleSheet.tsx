import { useState } from 'react'
import { Overlay } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { translateError } from '@/lib/errors'
import { useSettleDebts } from '@/hooks/useFriends'
import { useWallets } from '@/hooks/useSettings'
import { formatBaht } from '@/lib/format'
import type { Debt } from '@/lib/db'

/**
 * เคลียร์ยอด — record that a set of agreed balances was paid back. Like
 * ConfirmDebtSheet, the amount is shown ALWAYS (this sheet takes no hideBalance
 * prop, so it CAN'T be masked): you're deciding to move real money, not glancing
 * (STASH_CONTEXT §11.5). Settling several goes through debt_settle_many — one
 * transaction, all-or-nothing (0021); each debt still becomes its own ledger
 * entry, so the sheet says up front how many rows will appear.
 */
export function SettleSheet({
  debts,
  friendName,
  myUid,
  onClose,
}: {
  debts: Debt[]
  friendName: string
  myUid: string
  onClose: () => void
}) {
  const walletsQ = useWallets()
  const settle = useSettleDebts()
  const toast = useToast()
  const wallets = walletsQ.data ?? []
  const [walletId, setWalletId] = useState<string | null>(null)

  const total = debts.reduce((s, d) => s + d.amount, 0)
  const incomeCount = debts.filter((d) => d.creditor_id === myUid).length // I receive
  const expenseCount = debts.length - incomeCount // I pay

  const headline =
    expenseCount === 0
      ? `${friendName}คืนเงินคุณ`
      : incomeCount === 0
        ? `คุณคืนเงิน${friendName}`
        : `เคลียร์ยอดกับ${friendName}`

  const rowParts: string[] = []
  if (incomeCount > 0) rowParts.push(`เงินเข้า ${incomeCount} แถว`)
  if (expenseCount > 0) rowParts.push(`เงินออก ${expenseCount} แถว`)

  async function doSettle() {
    if (!walletId) return
    try {
      await settle.mutateAsync({ debtIds: debts.map((d) => d.id), walletId })
      toast.success('เคลียร์ยอดแล้ว')
      onClose()
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  return (
    <Overlay title="เคลียร์ยอด" onClose={onClose}>
      <p className="text-[13.5px] text-muted">{headline}</p>
      {/* amount — always visible, never masked (see file header) */}
      <p className="mt-1 text-[32px] font-medium leading-tight tabular-nums">{formatBaht(total)}</p>
      <p className="mt-1.5 text-[12px] text-faint">
        จะสร้างรายการเงินในกระเป๋าที่เลือก · {rowParts.join(' · ')} · ไม่นับรวมในงบ
      </p>

      <p className="mb-1.5 mt-5 text-[11px] uppercase tracking-[0.5px] text-faint">กระเป๋าของคุณ</p>
      {wallets.length === 0 ? (
        <p className="text-[12.5px] text-faint">ยังไม่มีกระเป๋า — เพิ่มในหน้าตั้งค่าก่อน</p>
      ) : (
        <div className="no-scrollbar mb-1 flex gap-[7px] overflow-x-auto">
          {wallets.map((w) => {
            const active = w.id === walletId
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => setWalletId(w.id)}
                className="flex min-h-[44px] shrink-0 items-center"
              >
                <span
                  className={`rounded-pill px-[13px] py-[7px] text-[12px] ${
                    active ? 'bg-brand-tint font-medium text-brand-ink' : 'bg-fill text-muted'
                  }`}
                >
                  {w.name}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <button
        disabled={!walletId || settle.isPending}
        onClick={doSettle}
        className="mt-5 w-full rounded-btn bg-brand-deep py-2.5 text-[14px] font-medium text-white disabled:opacity-40"
      >
        {settle.isPending ? 'กำลังเคลียร์…' : `เคลียร์ ${formatBaht(total)}`}
      </button>
    </Overlay>
  )
}
