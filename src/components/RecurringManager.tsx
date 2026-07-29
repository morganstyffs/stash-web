import { useMemo, useState } from 'react'
import { IconPencil, IconPlus, IconRepeat, IconTrash } from '@tabler/icons-react'
import { Overlay, Toggle } from '@/components/ui'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { useCategories } from '@/hooks/useLookups'
import { useWallets } from '@/hooks/useSettings'
import {
  useDeleteRecurring,
  useRecurringList,
  useToggleRecurringActive,
  useUpsertRecurring,
} from '@/hooks/useRecurring'
import { todayISO } from '@/lib/dates'
import { formatBaht } from '@/lib/format'
import { translateError } from '@/lib/errors'
import type { Recurring, TransactionType } from '@/lib/database.types'

type Freq = 'daily' | 'weekly' | 'monthly'
const FREQS: { key: Freq; label: string }[] = [
  { key: 'daily', label: 'รายวัน' },
  { key: 'weekly', label: 'รายสัปดาห์' },
  { key: 'monthly', label: 'รายเดือน' },
]

// getDay() (0=Sun) → schedule token; token → Thai label.
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DOW_TH: Record<string, string> = {
  sun: 'อาทิตย์',
  mon: 'จันทร์',
  tue: 'อังคาร',
  wed: 'พุธ',
  thu: 'พฤหัสบดี',
  fri: 'ศุกร์',
  sat: 'เสาร์',
}

/** Build the app-defined schedule string from a frequency + start date. */
function buildSchedule(freq: Freq, startISO: string): string {
  const d = new Date(startISO + 'T00:00:00')
  if (freq === 'weekly') return `weekly:${DOW[d.getDay()]}`
  if (freq === 'monthly') return `monthly:${d.getDate()}`
  return 'daily'
}

function freqOf(schedule: string): Freq {
  if (schedule.startsWith('weekly')) return 'weekly'
  if (schedule.startsWith('monthly')) return 'monthly'
  return 'daily'
}

/** Human-readable cadence for the list, e.g. "ทุกเดือน (วันที่ 15)". */
export function scheduleLabel(schedule: string): string {
  const [kind, arg] = schedule.split(':')
  if (kind === 'weekly') return `ทุกสัปดาห์ (${DOW_TH[arg] ?? arg})`
  if (kind === 'monthly') return `ทุกเดือน (วันที่ ${arg})`
  return 'ทุกวัน'
}

interface FormState {
  id?: string
  label: string
  type: TransactionType
  amount: string
  categoryId: string
  walletId: string
  freq: Freq
  startDate: string
}

export function RecurringManager({ onClose }: { onClose: () => void }) {
  const { data: rules } = useRecurringList()
  const { data: categories } = useCategories()
  const { data: wallets } = useWallets()
  const upsert = useUpsertRecurring()
  const toggle = useToggleRecurringActive()
  const del = useDeleteRecurring()
  const toast = useToast()

  const [form, setForm] = useState<FormState | null>(null)
  const [confirming, setConfirming] = useState<Recurring | null>(null)

  const today = todayISO()
  const isEdit = !!form?.id

  // categories selectable for the chosen kind (stock categories have their own
  // intake flow, so they're excluded — mirrors the favorites/budget pickers).
  const options = useMemo(
    () =>
      form
        ? (categories ?? []).filter((c) => c.kind === form.type && !c.is_stock_category)
        : [],
    [categories, form],
  )

  function startNew() {
    setForm({
      label: '',
      type: 'expense',
      amount: '',
      categoryId: '',
      walletId: '',
      freq: 'monthly',
      startDate: today,
    })
  }

  function startEdit(r: Recurring) {
    setForm({
      id: r.id,
      label: r.label,
      type: r.type,
      amount: String(r.amount),
      categoryId: r.category_id ?? '',
      walletId: r.wallet_id ?? '',
      freq: freqOf(r.schedule),
      startDate: r.next_run ?? today,
    })
  }

  async function submit() {
    if (!form) return
    try {
      await upsert.mutateAsync({
        id: form.id,
        label: form.label.trim(),
        type: form.type,
        amount: Number(form.amount || '0'),
        category_id: form.categoryId || null,
        wallet_id: form.walletId || null,
        schedule: buildSchedule(form.freq, form.startDate),
        next_run: form.startDate,
      })
      toast.success(form.id ? 'บันทึกรายการประจำแล้ว' : 'เพิ่มรายการประจำแล้ว')
      setForm(null)
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  async function confirmRemove() {
    if (!confirming) return
    try {
      await del.mutateAsync(confirming.id)
      toast.success('ลบรายการประจำแล้ว')
      setConfirming(null)
    } catch (e) {
      toast.error(translateError(e))
      setConfirming(null)
    }
  }

  const canSave =
    !!form && form.label.trim() !== '' && Number(form.amount || '0') > 0 && !upsert.isPending

  const list = rules ?? []

  return (
    <Overlay
      title="รายการประจำ"
      onClose={onClose}
      action={
        <button aria-label="เพิ่มรายการประจำ" onClick={startNew}>
          <IconPlus size={20} className="text-mint-deep" />
        </button>
      }
    >
      {form && (
        <div className="mb-4 rounded-card border-[0.5px] border-hairline p-3.5">
          <input
            autoFocus
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="ชื่อรายการ เช่น ค่าเช่าห้อง"
            className="mb-2.5 w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-mint"
          />

          <div className="mb-2.5 flex gap-1.5">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setForm({ ...form, type: k, categoryId: '' })}
                className={`rounded-pill px-4 py-[5px] text-[12px] ${
                  form.type === k
                    ? 'bg-mint-tint font-medium text-mint-text'
                    : 'border-[0.5px] border-hairline text-muted'
                }`}
              >
                {k === 'expense' ? 'รายจ่าย' : 'รายรับ'}
              </button>
            ))}
          </div>

          <div className="mb-2.5 flex items-center rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5">
            <span className="mr-1 text-[13px] text-faint">฿</span>
            <input
              value={form.amount}
              onChange={(e) =>
                setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, '') })
              }
              inputMode="decimal"
              placeholder="จำนวนต่อรอบ"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
            />
          </div>

          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="mb-2.5 w-full appearance-none rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-mint"
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
              className="mb-2.5 w-full appearance-none rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-mint"
            >
              <option value="">ไม่ระบุกระเป๋า</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}

          <p className="mb-1 ml-0.5 text-[11px] text-faint">ความถี่</p>
          <div className="mb-2.5 flex gap-1.5">
            {FREQS.map((f) => (
              <button
                key={f.key}
                onClick={() => setForm({ ...form, freq: f.key })}
                className={`rounded-pill px-3.5 py-[5px] text-[12px] ${
                  form.freq === f.key
                    ? 'bg-mint-tint font-medium text-mint-text'
                    : 'border-[0.5px] border-hairline text-muted'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <p className="mb-1 ml-0.5 text-[11px] text-faint">
            {isEdit ? 'รอบถัดไป' : 'เริ่มวันที่'}
          </p>
          <input
            type="date"
            value={form.startDate}
            min={isEdit ? undefined : today}
            onChange={(e) => setForm({ ...form, startDate: e.target.value || today })}
            className="mb-1.5 w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-mint"
          />
          <p className="mb-3 ml-0.5 text-[10.5px] text-faint">
            {scheduleLabel(buildSchedule(form.freq, form.startDate))} · เริ่ม{' '}
            {form.startDate === today ? 'วันนี้' : form.startDate}
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setForm(null)}
              className="rounded-btn border-[0.5px] border-hairline px-4 py-2.5 text-[13px] font-medium"
            >
              ยกเลิก
            </button>
            <button
              disabled={!canSave}
              onClick={submit}
              className="flex-1 rounded-btn bg-mint-deep py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
            >
              {upsert.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {list.length === 0 && !form ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <IconRepeat size={26} className="text-chevron" />
          <p className="text-[13px] text-faint">ยังไม่มีรายการประจำ</p>
          <p className="max-w-[240px] text-[11px] text-faint">
            ตั้งไว้เช่นค่าเช่า ค่าเน็ต เงินเดือน — ระบบจะสร้างรายการให้อัตโนมัติเมื่อถึงรอบ
          </p>
        </div>
      ) : (
        list.map((r) => {
          const catName = categories?.find((c) => c.id === r.category_id)?.name
          return (
            <div
              key={r.id}
              className="flex items-center gap-3 border-b-[0.5px] border-hairline py-2.5 last:border-b-0"
            >
              <div
                className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] ${
                  r.active ? 'bg-mint-tint' : 'bg-fill'
                }`}
              >
                <IconRepeat size={16} className={r.active ? 'text-mint-deep' : 'text-faint'} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[13.5px] ${r.active ? '' : 'text-muted'}`}>
                  {r.label}
                </p>
                <p className="text-[11px] text-faint">
                  {scheduleLabel(r.schedule)} · {r.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                  {catName ? ` · ${catName}` : ''} · {formatBaht(r.amount)}
                </p>
              </div>
              <Toggle
                on={r.active}
                onChange={(v) => toggle.mutate({ id: r.id, active: v })}
                label={`เปิด/ปิด ${r.label}`}
              />
              <button aria-label="แก้ไข" onClick={() => startEdit(r)}>
                <IconPencil size={16} className="text-faint" />
              </button>
              <button
                aria-label="ลบ"
                disabled={del.isPending}
                onClick={() => setConfirming(r)}
              >
                <IconTrash size={16} className="text-faint" />
              </button>
            </div>
          )
        })
      )}

      {confirming && (
        <ConfirmDialog
          title={`ลบรายการประจำ “${confirming.label}” ?`}
          message="รายการที่สร้างไปแล้วยังอยู่เหมือนเดิม — หยุดเฉพาะรอบในอนาคต"
          busy={del.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={confirmRemove}
        />
      )}
    </Overlay>
  )
}
