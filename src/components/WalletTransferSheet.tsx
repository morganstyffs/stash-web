import { useState } from 'react'
import { Overlay } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useCreateWalletTransfer } from '@/hooks/useSettings'
import { translateError } from '@/lib/errors'
import { sanitizeMoneyInput } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import type { Wallet } from '@/lib/db'

/**
 * บันทึกการโอนเงินระหว่างกระเป๋าตัวเอง.
 *
 * §11.4-11 "ซ่อนตอนกวาดตา เปิดตอนตัดสินใจ": this sheet asks the user to commit to
 * a move that shifts real money, so — like ConfirmDebtSheet / SettleSheet / the
 * sale panel in StockEditSheet — it ALWAYS shows the amount and takes NO
 * `hideBalance` prop at all. Confirming an amount you can't see is a blind
 * commitment; the masking guarantee is structural (the prop simply does not
 * exist here), not "we chose not to pass it".
 *
 * Create-only: a transfer is never edited (delete + re-add instead), so there is
 * no query-seeded form to clobber and the amount opens blank (no guessed value
 * that a stray tap would commit — same rule as ราคาขาย / ค่าส่ง / ยอดตั้งต้น).
 */
export function WalletTransferSheet({
  wallets,
  onClose,
}: {
  wallets: Wallet[]
  onClose: () => void
}) {
  const create = useCreateWalletTransfer()
  const toast = useToast()
  const today = todayISO()

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')

  const amountNum = Number(amount || '0')
  const canSubmit = !!from && !!to && from !== to

  async function submit() {
    // UI already blocks from === to (the picker filters it) and future dates
    // (max on the input); the RPC re-checks everything and its Thai message
    // reaches the user if a guard is somehow bypassed.
    if (!from || !to) {
      toast.error('เลือกกระเป๋าต้นทางและปลายทางก่อน')
      return
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error('ใส่จำนวนเงินที่มากกว่า 0')
      return
    }
    if (date > today) {
      toast.error('วันที่โอนต้องไม่เป็นวันในอนาคต')
      return
    }
    try {
      // await the server before closing — no optimistic update (AddPage pattern).
      await create.mutateAsync({ from, to, amount: amountNum, date, note })
      toast.success('บันทึกการโอนแล้ว')
      onClose()
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  return (
    <Overlay title="โอนเงินระหว่างกระเป๋า" onClose={onClose}>
      <div className="flex flex-col gap-3 pb-2">
        {/* จากกระเป๋า */}
        <div>
          <p className="mb-1.5 text-[12px] text-muted">จากกระเป๋า</p>
          <div className="flex flex-wrap gap-1.5">
            {wallets.map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  setFrom(w.id)
                  if (to === w.id) setTo('') // can't send to the same wallet
                }}
                className={`max-w-full truncate rounded-pill px-4 py-[5px] text-[12px] ${
                  from === w.id
                    ? 'bg-brand-tint font-medium text-brand-ink'
                    : 'border-[0.5px] border-hairline text-muted'
                }`}
              >
                {w.name}
              </button>
            ))}
          </div>
        </div>

        {/* ไปกระเป๋า — the source wallet is filtered out so from === to is
            unreachable from the UI (the RPC is still the real guard). */}
        <div>
          <p className="mb-1.5 text-[12px] text-muted">ไปกระเป๋า</p>
          <div className="flex flex-wrap gap-1.5">
            {wallets
              .filter((w) => w.id !== from)
              .map((w) => (
                <button
                  key={w.id}
                  onClick={() => setTo(w.id)}
                  className={`max-w-full truncate rounded-pill px-4 py-[5px] text-[12px] ${
                    to === w.id
                      ? 'bg-brand-tint font-medium text-brand-ink'
                      : 'border-[0.5px] border-hairline text-muted'
                  }`}
                >
                  {w.name}
                </button>
              ))}
          </div>
        </div>

        {/* จำนวนเงิน — opens blank; always shown (no hideBalance here). */}
        <div>
          <label htmlFor="transfer-amount" className="mb-1.5 block text-[12px] text-muted">
            จำนวนเงิน
          </label>
          <div className="flex items-center rounded-input border-[0.5px] border-hairline bg-fill px-3 focus-within:border-brand">
            <span className="mr-1 text-[13px] text-faint">฿</span>
            <input
              id="transfer-amount"
              value={amount}
              onChange={(e) => setAmount(sanitizeMoneyInput(e.target.value))}
              inputMode="decimal"
              placeholder="0"
              className="w-full bg-transparent py-2.5 text-[13px] tabular-nums outline-none"
            />
          </div>
        </div>

        {/* วันที่ — default today (Bangkok), never the future (max blocks it in the
            picker; submit() re-checks). */}
        <div>
          <label htmlFor="transfer-date" className="mb-1.5 block text-[12px] text-muted">
            วันที่
          </label>
          <input
            id="transfer-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-brand"
          />
        </div>

        {/* โน้ต (ไม่บังคับ) */}
        <div>
          <label htmlFor="transfer-note" className="mb-1.5 block text-[12px] text-muted">
            โน้ต (ไม่บังคับ)
          </label>
          <input
            id="transfer-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น กดเงินสด"
            className="w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-brand"
          />
        </div>

        <div className="mt-1 flex gap-2">
          <button
            onClick={onClose}
            className="rounded-btn border-[0.5px] border-hairline px-4 py-2.5 text-[13px] font-medium"
          >
            ยกเลิก
          </button>
          <button
            disabled={!canSubmit || create.isPending}
            onClick={submit}
            className="flex-1 rounded-btn bg-brand-deep py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
          >
            โอน
          </button>
        </div>
      </div>
    </Overlay>
  )
}
