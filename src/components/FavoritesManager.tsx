import { useMemo, useState } from 'react'
import { IconPencil, IconPlus, IconStar, IconTrash } from '@tabler/icons-react'
import { Overlay } from '@/components/ui'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import {
  useCategories,
  useDeleteFavorite,
  useFavorites,
  useUpsertFavorite,
} from '@/hooks/useLookups'
import { useWallets } from '@/hooks/useSettings'
import { formatBaht } from '@/lib/format'
import { translateError } from '@/lib/errors'
import type { Favorite, TransactionType } from '@/lib/db'

interface FormState {
  id?: string
  label: string
  type: TransactionType
  amount: string
  categoryId: string
  walletId: string
  note: string
}

const EMPTY: FormState = {
  label: '',
  type: 'expense',
  amount: '',
  categoryId: '',
  walletId: '',
  note: '',
}

export function FavoritesManager({ onClose }: { onClose: () => void }) {
  const { data: favorites } = useFavorites()
  const { data: categories } = useCategories()
  const { data: wallets } = useWallets()
  const upsert = useUpsertFavorite()
  const del = useDeleteFavorite()
  const toast = useToast()
  const [form, setForm] = useState<FormState | null>(null)
  const [confirming, setConfirming] = useState<Favorite | null>(null)

  // categories selectable for the chosen kind (stock categories excluded — they
  // have their own intake flow, not a quick-add favorite). 'ขายสต็อก'
  // (stock_sale_income) is excluded too: a fast-label into it would let a resale
  // be booked without a paired COGS and outside stock_sales (see AddPage).
  const options = useMemo(
    () =>
      form
        ? (categories ?? []).filter(
            (c) => c.kind === form.type && !c.is_stock_category && c.system_key !== 'stock_sale_income',
          )
        : [],
    [categories, form],
  )

  async function confirmRemove() {
    if (!confirming) return
    try {
      await del.mutateAsync(confirming.id)
      toast.success('ลบรายการโปรดแล้ว')
      setConfirming(null)
    } catch (e) {
      toast.error(translateError(e))
      setConfirming(null)
    }
  }

  async function submit() {
    if (!form) return
    try {
      await upsert.mutateAsync({
        id: form.id,
        label: form.label.trim(),
        type: form.type,
        amount: form.amount ? Number(form.amount) : null,
        category_id: form.categoryId || null,
        wallet_id: form.walletId || null,
        note: form.note.trim() || null,
      })
      toast.success(form.id ? 'บันทึกรายการโปรดแล้ว' : 'เพิ่มรายการโปรดแล้ว')
      setForm(null)
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  const list = favorites ?? []

  return (
    <Overlay
      title="รายการโปรด"
      onClose={onClose}
      action={
        <button aria-label="เพิ่มรายการโปรด" onClick={() => setForm({ ...EMPTY })}>
          <IconPlus size={20} className="text-brand-deep" />
        </button>
      }
    >
      {form && (
        <div className="mb-4 rounded-card border-[0.5px] border-hairline p-3.5">
          <input
            autoFocus
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="ชื่อรายการโปรด เช่น กาแฟเช้า"
            className="mb-2.5 w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-brand"
          />
          <div className="mb-2.5 flex gap-1.5">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setForm({ ...form, type: k, categoryId: '' })}
                className={`rounded-pill px-4 py-[5px] text-[12px] ${
                  form.type === k
                    ? 'bg-brand-tint font-medium text-brand-ink'
                    : 'border-[0.5px] border-hairline text-muted'
                }`}
              >
                {k === 'expense' ? 'รายจ่าย' : 'รายรับ'}
              </button>
            ))}
          </div>
          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="mb-2.5 w-full appearance-none rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-brand"
          >
            <option value="">ไม่ระบุหมวด</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {wallets && wallets.length > 0 && (
            <select
              value={form.walletId}
              onChange={(e) => setForm({ ...form, walletId: e.target.value })}
              className="mb-2.5 w-full appearance-none rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-brand"
            >
              <option value="">ไม่ระบุกระเป๋า (ใช้กระเป๋าเริ่มต้น)</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
          <div className="mb-3 flex items-center rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5">
            <span className="mr-1 text-[13px] text-faint">฿</span>
            <input
              value={form.amount}
              onChange={(e) =>
                setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, '') })
              }
              inputMode="decimal"
              placeholder="จำนวน (ไม่ใส่ก็ได้)"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
            />
          </div>
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="โน้ต (ไม่ใส่ก็ได้)"
            className="mb-3 w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none placeholder:text-faint focus:border-brand"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setForm(null)}
              className="rounded-btn border-[0.5px] border-hairline px-4 py-2.5 text-[13px] font-medium"
            >
              ยกเลิก
            </button>
            <button
              disabled={!form.label.trim() || upsert.isPending}
              onClick={submit}
              className="flex-1 rounded-btn bg-brand-deep py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
            >
              {upsert.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {list.length === 0 && !form ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <IconStar size={26} className="text-chevron" />
          <p className="text-[13px] text-faint">ยังไม่มีรายการโปรด</p>
          <p className="max-w-[220px] text-[11px] text-faint">
            สร้างไว้เพื่อบันทึกรายการที่ทำบ่อยได้ในแตะเดียวจากหน้าเพิ่มรายการ
          </p>
        </div>
      ) : (
        list.map((f) => {
          const catName = categories?.find((c) => c.id === f.category_id)?.name
          const walletName = wallets?.find((w) => w.id === f.wallet_id)?.name
          return (
            <div
              key={f.id}
              className="flex items-center gap-3 border-b-[0.5px] border-hairline py-2.5 last:border-b-0"
            >
              <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-fill">
                <IconStar size={16} className="text-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px]">{f.label}</p>
                <p className="text-[11px] text-faint">
                  {f.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                  {catName ? ` · ${catName}` : ''}
                  {walletName ? ` · ${walletName}` : ''}
                  {f.amount != null ? ` · ${formatBaht(f.amount)}` : ''}
                </p>
              </div>
              <button
                aria-label="แก้ไข"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-fill"
                onClick={() =>
                  setForm({
                    id: f.id,
                    label: f.label,
                    type: f.type,
                    amount: f.amount != null ? String(f.amount) : '',
                    categoryId: f.category_id ?? '',
                    walletId: f.wallet_id ?? '',
                    note: f.note ?? '',
                  })
                }
              >
                <IconPencil size={16} className="text-faint" />
              </button>
              <button
                aria-label="ลบ"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-expense-bg disabled:opacity-50"
                disabled={del.isPending}
                onClick={() => setConfirming(f)}
              >
                <IconTrash size={16} className="text-faint" />
              </button>
            </div>
          )
        })
      )}

      {confirming && (
        <ConfirmDialog
          title={`ลบรายการโปรด “${confirming.label}” ?`}
          busy={del.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={confirmRemove}
        />
      )}
    </Overlay>
  )
}
