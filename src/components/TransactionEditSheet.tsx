import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconBox, IconTrash, IconX } from '@tabler/icons-react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { useCategories } from '@/hooks/useLookups'
import { useWallets } from '@/hooks/useSettings'
import {
  isSaleLinked,
  isStockLinked,
  useDeleteTransaction,
  useTransaction,
  useUpdateTransaction,
} from '@/hooks/useTransactions'
import { categoryIcon } from '@/lib/icons'
import { todayISO } from '@/lib/dates'
import { formatDayShort } from '@/lib/format'
import { translateError } from '@/lib/errors'

/**
 * Edit or delete an existing transaction (bottom sheet, the shared modal
 * pattern). Stock-purchase rows keep their amount + category read-only — those
 * are managed on the stock screen so the ledger and inventory can't drift — and
 * cannot be deleted here; the sheet points to the stock screen instead.
 */
export function TransactionEditSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const txQ = useTransaction(id)
  const catsQ = useCategories()
  const walletsQ = useWallets()
  const update = useUpdateTransaction()
  const del = useDeleteTransaction()

  const [amountStr, setAmountStr] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [walletId, setWalletId] = useState<string | null>(null)
  const [dateStr, setDateStr] = useState('')
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)

  const tx = txQ.data
  const stockLinked = tx ? isStockLinked(tx) : false
  // Sale-linked rows (income/COGS of a sale) are stricter: a DB trigger blocks
  // changing the date too, so lock it and route deletion to the reverse flow.
  const saleLinked = tx ? isSaleLinked(tx) : false
  const today = todayISO()

  // seed the form once the row loads
  useEffect(() => {
    if (!tx) return
    setAmountStr(String(tx.amount))
    setCategoryId(tx.category_id)
    setWalletId(tx.wallet_id)
    setDateStr(tx.date)
    setNote(tx.note ?? '')
  }, [tx])

  const categories = (catsQ.data ?? []).filter(
    (c) => tx && c.kind === tx.type && !c.is_stock_category,
  )
  const wallets = walletsQ.data ?? []

  const amount = Number(amountStr || '0')
  const canSave = !!tx && (stockLinked || (amount > 0 && !!categoryId)) && !update.isPending

  async function save() {
    if (!tx) return
    try {
      await update.mutateAsync(
        saleLinked
          ? // sale rows: only wallet + note are editable (trigger blocks the rest)
            { id: tx.id, wallet_id: walletId, note: note.trim() || null }
          : stockLinked
            ? { id: tx.id, wallet_id: walletId, date: dateStr, note: note.trim() || null }
            : {
                id: tx.id,
                amount,
                category_id: categoryId,
                wallet_id: walletId,
                date: dateStr,
                note: note.trim() || null,
              },
      )
      toast.success('บันทึกการแก้ไขแล้ว')
      onClose()
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  async function remove() {
    if (!tx) return
    try {
      await del.mutateAsync(tx.id)
      toast.success('ลบรายการแล้ว')
      onClose()
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-[22px] bg-white sm:rounded-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
          <p className="text-[16px] font-medium">แก้ไขรายการ</p>
          <button aria-label="ปิด" onClick={onClose}>
            <IconX size={20} className="text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {!tx ? (
            <div className="animate-pulse space-y-3 py-2">
              <div className="h-10 rounded-input bg-fill" />
              <div className="h-10 rounded-input bg-fill" />
              <div className="h-10 rounded-input bg-fill" />
            </div>
          ) : (
            <>
              {stockLinked && (
                <div className="mb-3 flex items-start gap-2 rounded-card bg-brand-tint px-3 py-2.5">
                  <IconBox size={15} className="mt-px shrink-0 text-brand-deep" />
                  <p className="text-[11.5px] leading-relaxed text-brand-ink">
                    {saleLinked
                      ? 'รายการนี้มาจากการขายสต็อก — ยอด หมวด และวันที่ล็อกไว้ ที่นี่แก้ได้เฉพาะกระเป๋าและโน้ต ถ้าจะแก้ต้องย้อนการขายที่หน้าคลังสินค้า'
                      : 'รายการนี้มาจากการซื้อเข้าสต็อก — ยอดเงินและหมวดแก้ที่หน้าคลังสินค้า ที่นี่แก้ได้เฉพาะกระเป๋า วันที่ และโน้ต'}
                  </p>
                </div>
              )}

              {/* amount */}
              <p className="mb-1 ml-0.5 text-[11px] text-faint">จำนวนเงิน</p>
              <div
                className={`mb-3 flex items-center rounded-input border-[0.5px] border-hairline px-[11px] py-[10px] ${
                  stockLinked ? 'bg-fill/60' : 'bg-fill'
                }`}
              >
                <span className="mr-1 text-[13px] text-faint">฿</span>
                <input
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  disabled={stockLinked}
                  className="w-full bg-transparent text-[13px] outline-none disabled:text-muted"
                />
              </div>

              {/* category */}
              <p className="mb-1 ml-0.5 text-[11px] text-faint">หมวด</p>
              {stockLinked ? (
                <div className="mb-3 rounded-input border-[0.5px] border-hairline bg-fill/60 px-[11px] py-[10px] text-[13px] text-muted">
                  {catsQ.data?.find((c) => c.id === categoryId)?.name ?? 'หมวดสต็อก'}
                </div>
              ) : (
                <div className="no-scrollbar mb-3 flex gap-[7px] overflow-x-auto">
                  {categories.map((c) => {
                    const Icon = categoryIcon(c.icon)
                    const active = c.id === categoryId
                    return (
                      <button
                        key={c.id}
                        onClick={() => setCategoryId(c.id)}
                        className={`flex shrink-0 items-center gap-1 rounded-pill px-[13px] py-[7px] text-[12px] ${
                          active
                            ? 'bg-brand-tint font-medium text-brand-ink'
                            : 'bg-fill text-muted'
                        }`}
                      >
                        <Icon size={14} />
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* wallet */}
              {wallets.length > 0 && (
                <>
                  <p className="mb-1 ml-0.5 text-[11px] text-faint">กระเป๋า</p>
                  <div className="no-scrollbar mb-3 flex gap-[7px] overflow-x-auto">
                    {wallets.map((w) => {
                      const active = w.id === walletId
                      return (
                        <button
                          key={w.id}
                          onClick={() => setWalletId(w.id)}
                          className={`shrink-0 rounded-pill px-[13px] py-[6px] text-[12px] ${
                            active
                              ? 'bg-brand-tint font-medium text-brand-ink'
                              : 'bg-fill text-muted'
                          }`}
                        >
                          {w.name}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              {/* date — locked for sale rows (DB trigger blocks changing it) */}
              <p className="mb-1 ml-0.5 text-[11px] text-faint">วันที่</p>
              <label
                className={`mb-3 flex items-center justify-between rounded-input border-[0.5px] border-hairline px-[11px] py-[10px] text-[13px] ${
                  saleLinked ? 'bg-fill/60' : 'bg-fill'
                }`}
              >
                <span className={saleLinked ? 'text-muted' : undefined}>
                  {dateStr === today
                    ? 'วันนี้'
                    : dateStr
                      ? formatDayShort(new Date(dateStr + 'T00:00:00'))
                      : '—'}
                </span>
                {!saleLinked && (
                  <input
                    type="date"
                    value={dateStr}
                    max={today}
                    onChange={(e) => setDateStr(e.target.value || today)}
                    aria-label="เลือกวันที่"
                    className="cursor-pointer bg-transparent text-right text-[12px] text-muted outline-none"
                  />
                )}
              </label>

              {/* note */}
              <p className="mb-1 ml-0.5 text-[11px] text-faint">โน้ต</p>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เพิ่มโน้ต (ไม่ใส่ก็ได้)"
                className="mb-4 w-full rounded-input border-[0.5px] border-hairline bg-fill px-[11px] py-[10px] text-[13px] outline-none placeholder:text-faint focus:border-brand"
              />

              {/* delete / stock hint */}
              {stockLinked ? (
                <button
                  onClick={() => {
                    onClose()
                    navigate('/stock')
                  }}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-brand-deep"
                >
                  <IconBox size={15} />
                  {saleLinked ? 'ไปที่คลังสินค้าเพื่อย้อนการขาย' : 'ไปที่คลังสินค้าเพื่อลบ'}
                </button>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-expense"
                >
                  <IconTrash size={15} />
                  ลบรายการนี้
                </button>
              )}
            </>
          )}
        </div>

        <div className="border-t-[0.5px] border-hairline px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-3">
          <button
            onClick={save}
            disabled={!canSave}
            className="w-full rounded-btn bg-brand-deep py-3.5 text-[15px] font-medium text-white disabled:opacity-40"
          >
            {update.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title="ลบรายการนี้?"
          message="รายการจะถูกลบถาวร ย้อนกลับไม่ได้"
          busy={del.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={remove}
        />
      )}
    </div>
  )
}
