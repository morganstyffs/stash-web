import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { IconArrowsExchange, IconBox, IconTrash, IconX } from '@tabler/icons-react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useDialogA11y } from '@/lib/useDialogA11y'
import { useToast } from '@/components/Toast'
import { useAuth } from '@/hooks/useAuth'
import { useCategories } from '@/hooks/useLookups'
import { useWallets } from '@/hooks/useSettings'
import {
  restoreTransaction,
  useDeleteTransaction,
  useTransaction,
  useUpdateTransaction,
} from '@/hooks/useTransactions'
import { lockedRowInfo } from '@/lib/ledger'
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
  const qc = useQueryClient()
  const { user } = useAuth()
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
  // One concept for every locked row (stock purchase/sale, debt settlement): its
  // amount + category are never editable inline; some kinds also lock the date; a
  // DB trigger enforces all of it, so route deletion to the matching undo flow.
  const lock = tx ? lockedRowInfo(tx) : null
  const locked = lock !== null
  const dateLocked = lock !== null && !lock.dateEditable
  const today = todayISO()

  // seed the form once the row loads
  useEffect(() => {
    if (!tx) return
    setAmountStr(String(tx.amount))
    setCategoryId(tx.category_id)
    setWalletId(tx.wallet_id)
    setDateStr(tx.date)
    setNote(tx.note ?? '')
    // ผูกกับ id ไม่ใช่ object: refetch-on-focus จะรัน effect ซ้ำแล้วทับสิ่งที่ผู้ใช้พิมพ์ค้างไว้
  }, [tx?.id])

  // Exclude stock-intake categories and 'ขายสต็อก' (stock_sale_income): a plain
  // row must not be re-categorised into a resale income that has no paired COGS
  // and never reaches stock_sales (see AddPage). Sale-linked rows are locked
  // anyway; this closes the same hole for editing an ordinary row.
  const categories = (catsQ.data ?? []).filter(
    (c) => tx && c.kind === tx.type && !c.is_stock_category && c.system_key !== 'stock_sale_income',
  )
  const wallets = walletsQ.data ?? []

  const amount = Number(amountStr || '0')
  const canSave = !!tx && (locked || (amount > 0 && !!categoryId)) && !update.isPending

  async function save() {
    if (!tx) return
    try {
      await update.mutateAsync(
        dateLocked
          ? // sale / settlement rows: only wallet + note editable (trigger blocks the rest)
            { id: tx.id, wallet_id: walletId, note: note.trim() || null }
          : locked
            ? // stock purchase: wallet + date + note editable
              { id: tx.id, wallet_id: walletId, date: dateStr, note: note.trim() || null }
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
    if (!tx || !user) return
    const snap = { ...tx } // snapshot before the delete empties the query
    try {
      await del.mutateAsync(tx.id)
      onClose() // close before the toast so it isn't hidden behind the sheet
      toast.show({
        kind: 'success',
        message: 'ลบรายการแล้ว',
        // long enough to catch the undo, short enough not to pile up (default 2600 is too short)
        duration: 6000,
        action: {
          label: 'เลิกทำ',
          onClick: () => {
            // fires after this sheet has unmounted; restoreTransaction is a plain
            // function over the app-level QueryClient, not a component-bound hook
            void (async () => {
              try {
                await restoreTransaction(snap, user.id)
                qc.invalidateQueries({ queryKey: ['transactions'] })
                toast.success('คืนรายการแล้ว')
              } catch (e) {
                toast.error(translateError(e)) // never swallow (convention 16)
              }
            })()
          },
        },
      })
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  const panelRef = useDialogA11y(onClose)
  const titleId = useId()

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-[22px] bg-white sm:rounded-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
          <p id={titleId} className="text-[16px] font-medium">แก้ไขรายการ</p>
          <button
            aria-label="ปิด"
            onClick={onClose}
            className="-m-2.5 flex h-11 w-11 items-center justify-center rounded-full"
          >
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
              {lock && (
                <div className="mb-3 flex items-start gap-2 rounded-card bg-brand-tint px-3 py-2.5">
                  {lock.kind === 'debt_settlement' ? (
                    <IconArrowsExchange size={15} className="mt-px shrink-0 text-brand-deep" />
                  ) : (
                    <IconBox size={15} className="mt-px shrink-0 text-brand-deep" />
                  )}
                  <p className="text-[11.5px] leading-relaxed text-brand-ink">{lock.reason}</p>
                </div>
              )}

              {/* amount */}
              <p className="mb-1 ml-0.5 text-[11px] text-faint">จำนวนเงิน</p>
              <div
                className={`mb-3 flex items-center rounded-input border-[0.5px] border-hairline px-[11px] py-[10px] ${
                  locked ? 'bg-fill/60' : 'bg-fill'
                }`}
              >
                <span className="mr-1 text-[13px] text-faint">฿</span>
                <input
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  disabled={locked}
                  className="w-full bg-transparent text-[13px] outline-none disabled:text-muted"
                />
              </div>

              {/* category */}
              <p className="mb-1 ml-0.5 text-[11px] text-faint">หมวด</p>
              {locked ? (
                <div className="mb-3 rounded-input border-[0.5px] border-hairline bg-fill/60 px-[11px] py-[10px] text-[13px] text-muted">
                  {catsQ.data?.find((c) => c.id === categoryId)?.name ?? 'หมวดระบบ'}
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
                        className="flex min-h-[44px] shrink-0 items-center"
                      >
                        <span
                          className={`flex items-center gap-1 rounded-pill px-[13px] py-[7px] text-[12px] ${
                            active
                              ? 'bg-brand-tint font-medium text-brand-ink'
                              : 'bg-fill text-muted'
                          }`}
                        >
                          <Icon size={14} />
                          {c.name}
                        </span>
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
                          className="flex min-h-[44px] shrink-0 items-center"
                        >
                          <span
                            className={`shrink-0 rounded-pill px-[13px] py-[6px] text-[12px] ${
                              active
                                ? 'bg-brand-tint font-medium text-brand-ink'
                                : 'bg-fill text-muted'
                            }`}
                          >
                            {w.name}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              {/* date — locked for sale + settlement rows (DB trigger blocks it) */}
              <p className="mb-1 ml-0.5 text-[11px] text-faint">วันที่</p>
              <label
                className={`mb-3 flex items-center justify-between rounded-input border-[0.5px] border-hairline px-[11px] py-[10px] text-[13px] ${
                  dateLocked ? 'bg-fill/60' : 'bg-fill'
                }`}
              >
                <span className={dateLocked ? 'text-muted' : undefined}>
                  {dateStr === today
                    ? 'วันนี้'
                    : dateStr
                      ? formatDayShort(new Date(dateStr + 'T00:00:00'))
                      : '—'}
                </span>
                {!dateLocked && (
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

              {/* delete / undo hint — routed by the locked kind */}
              {lock ? (
                <button
                  onClick={() => {
                    onClose()
                    navigate(lock.actionTo)
                  }}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-brand-deep"
                >
                  {lock.kind === 'debt_settlement' ? (
                    <IconArrowsExchange size={15} />
                  ) : (
                    <IconBox size={15} />
                  )}
                  {lock.actionLabel}
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
