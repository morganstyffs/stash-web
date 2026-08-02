import { useState } from 'react'
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { Overlay, Toggle } from '@/components/ui'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { categoryIcon, ICON_NAMES } from '@/lib/icons'
import { catColorVar } from '@/lib/catColor'
import { useCategories } from '@/hooks/useLookups'
import {
  useDeleteCategory,
  useToggleShopCategory,
  useToggleStockCategory,
  useUpsertCategory,
} from '@/hooks/useSettings'
import { translateError } from '@/lib/errors'
import type { Category, CategoryKind } from '@/lib/db'

interface FormState {
  id?: string
  name: string
  kind: CategoryKind
  is_stock_category: boolean
  is_shop_category: boolean
  icon: string
  /** chosen slot 1–6, or null (create only) = let the DB assign an unused one */
  colorIndex: number | null
}

const COLOR_SLOTS = [1, 2, 3, 4, 5, 6] as const

export function CategoriesManager({ onClose }: { onClose: () => void }) {
  const { data: categories } = useCategories()
  const upsert = useUpsertCategory()
  const del = useDeleteCategory()
  const toggle = useToggleStockCategory()
  const shopToggle = useToggleShopCategory()
  const toast = useToast()

  async function onShopToggle(c: Category, value: boolean) {
    try {
      await shopToggle.mutateAsync({ id: c.id, value })
    } catch (e) {
      // Should be unreachable — the toggle is disabled on system/stock categories
      // (mirrors the DB CHECK) — but rule 16: if 23514 fires anyway, tell the user.
      toast.error(translateError(e))
    }
  }
  const [form, setForm] = useState<FormState | null>(null)
  const [confirming, setConfirming] = useState<Category | null>(null)

  const list = categories ?? []
  // colour slots already taken by OTHER categories — marked in the picker so a
  // duplicate is a conscious choice, not a surprise (donut collisions only).
  const usedColors = new Set(list.filter((c) => c.id !== form?.id).map((c) => c.color_index))
  const groups: { kind: CategoryKind; label: string }[] = [
    { kind: 'expense', label: 'รายจ่าย' },
    { kind: 'income', label: 'รายรับ' },
  ]

  async function confirmRemove() {
    if (!confirming) return
    try {
      await del.mutateAsync(confirming.id)
      toast.success('ลบหมวดแล้ว')
      setConfirming(null)
    } catch (e) {
      toast.error(translateError(e))
      setConfirming(null)
    }
  }

  return (
    <Overlay
      title="หมวด"
      onClose={onClose}
      action={
        <button
          aria-label="เพิ่มหมวด"
          onClick={() =>
            setForm({ name: '', kind: 'expense', is_stock_category: false, is_shop_category: false, icon: 'tag', colorIndex: null })
          }
        >
          <IconPlus size={20} className="text-brand-deep" />
        </button>
      }
    >
      {form && (
        <div className="mb-4 rounded-card border-[0.5px] border-hairline p-3.5">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ชื่อหมวด"
            className="mb-2.5 w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-brand"
          />
          <div className="mb-3 flex gap-1.5">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setForm({ ...form, kind: k })}
                className={`rounded-pill px-4 py-[5px] text-[12px] ${
                  form.kind === k
                    ? 'bg-brand-tint font-medium text-brand-ink'
                    : 'border-[0.5px] border-hairline text-muted'
                }`}
              >
                {k === 'expense' ? 'รายจ่าย' : 'รายรับ'}
              </button>
            ))}
          </div>

          {/* colour — 6 slots; a dot marks slots another category already uses */}
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">สี</p>
          <div className="mb-1.5 flex gap-2.5">
            {COLOR_SLOTS.map((ci) => {
              const selected = form.colorIndex === ci
              return (
                <button
                  key={ci}
                  type="button"
                  aria-label={`สีที่ ${ci}${usedColors.has(ci) ? ' (มีหมวดอื่นใช้แล้ว)' : ''}`}
                  aria-pressed={selected}
                  onClick={() => setForm({ ...form, colorIndex: ci })}
                  className={`relative h-7 w-7 rounded-full ${
                    selected ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''
                  }`}
                  style={{ background: catColorVar(ci) }}
                >
                  {usedColors.has(ci) && (
                    <span
                      aria-hidden
                      className="absolute -right-0.5 -top-0.5 h-[7px] w-[7px] rounded-full bg-ink ring-1 ring-surface"
                    />
                  )}
                </button>
              )
            })}
          </div>
          {form.colorIndex != null && usedColors.has(form.colorIndex) ? (
            <p className="mb-3 text-[11px] text-warn-ink">
              สีนี้มีหมวดอื่นใช้อยู่แล้ว — ใช้ซ้ำได้ แต่ในโดนัทอาจดูคล้ายกัน
            </p>
          ) : !form.id && form.colorIndex == null ? (
            <p className="mb-3 text-[11px] text-faint">ไม่เลือก = ระบบจะเลือกสีที่ยังว่างให้อัตโนมัติ</p>
          ) : (
            <div className="mb-3" />
          )}

          {/* icon — only names lib/icons.tsx knows (single source) */}
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">ไอคอน</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ICON_NAMES.map((n) => {
              const I = categoryIcon(n)
              const selected = form.icon === n
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`ไอคอน ${n}`}
                  aria-pressed={selected}
                  onClick={() => setForm({ ...form, icon: n })}
                  className={`flex h-9 w-9 items-center justify-center rounded-[10px] border-[0.5px] ${
                    selected ? 'border-brand bg-brand-tint' : 'border-hairline'
                  }`}
                >
                  <I size={18} className={selected ? 'text-brand-deep' : 'text-muted'} />
                </button>
              )
            })}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setForm(null)}
              className="rounded-btn border-[0.5px] border-hairline px-4 py-2.5 text-[13px] font-medium"
            >
              ยกเลิก
            </button>
            <button
              disabled={!form.name.trim() || upsert.isPending}
              onClick={async () => {
                try {
                  await upsert.mutateAsync({
                    id: form.id,
                    name: form.name.trim(),
                    kind: form.kind,
                    is_stock_category: form.is_stock_category,
                    is_shop_category: form.is_shop_category,
                    icon: form.icon,
                    colorIndex: form.colorIndex,
                  })
                  toast.success(form.id ? 'บันทึกหมวดแล้ว' : 'เพิ่มหมวดแล้ว')
                  setForm(null)
                } catch (e) {
                  toast.error(translateError(e))
                }
              }}
              className="flex-1 rounded-btn bg-brand-deep py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
            >
              บันทึก
            </button>
          </div>
        </div>
      )}

      <p className="mb-3 rounded-card bg-fill px-3.5 py-2.5 text-[11px] leading-relaxed text-muted">
        ป้าย “ร้าน” ทำให้รายการในหมวดนั้นเป็นค่าดำเนินร้าน — นับในยอดจ่ายรวม แต่ไม่กินงบส่วนตัว ·
        เปลี่ยนป้ายแล้วตัวเลขสรุปและกำไรของเดือนก่อน ๆ จะขยับตามด้วย · แนะนำให้สร้างหมวดใหม่สำหรับร้านโดยเฉพาะ
        อย่าติดป้ายให้หมวดที่ใช้ปนกับเรื่องส่วนตัว
      </p>

      {groups.map((g) => {
        const rows = list.filter((c) => c.kind === g.kind)
        if (rows.length === 0) return null
        return (
          <div key={g.kind} className="mb-2">
            <p className="mb-1 mt-2 text-[11px] uppercase tracking-[0.5px] text-faint">
              {g.label}
            </p>
            {rows.map((c) => {
              const Icon = categoryIcon(c.icon)
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 border-b-[0.5px] border-hairline py-2.5 last:border-b-0"
                >
                  <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-fill">
                    <Icon size={16} style={{ color: catColorVar(c.color_index) }} />
                  </div>
                  <span className="flex-1 truncate text-[13.5px]">{c.name}</span>
                  {/* stock (expense only) + shop (both kinds) — mutually
                      exclusive: each is disabled while the other is on, mirroring
                      the DB CHECK. Shop is also disabled on system categories
                      (they can never be a shop bucket). */}
                  {c.kind === 'expense' && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-faint">สต็อก</span>
                      <Toggle
                        on={c.is_stock_category}
                        disabled={c.is_shop_category}
                        onChange={(v) => toggle.mutate({ id: c.id, value: v })}
                        label={`ลงสต็อกอัตโนมัติ ${c.name}`}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-faint">ร้าน</span>
                    <Toggle
                      on={c.is_shop_category}
                      disabled={c.is_system || c.is_stock_category}
                      onChange={(v) => onShopToggle(c, v)}
                      label={`หมวดร้าน ${c.name}`}
                    />
                  </div>
                  <button
                    aria-label="แก้ไข"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-fill"
                    onClick={() =>
                      setForm({
                        id: c.id,
                        name: c.name,
                        kind: c.kind,
                        is_stock_category: c.is_stock_category,
                        is_shop_category: c.is_shop_category,
                        icon: c.icon,
                        colorIndex: c.color_index,
                      })
                    }
                  >
                    <IconPencil size={16} className="text-faint" />
                  </button>
                  <button
                    aria-label="ลบ"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-expense-bg disabled:opacity-50"
                    disabled={del.isPending}
                    onClick={() => setConfirming(c)}
                  >
                    <IconTrash size={16} className="text-faint" />
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}

      {confirming && (
        <ConfirmDialog
          title={`ลบหมวด “${confirming.name}” ?`}
          message="ถ้าหมวดนี้ยังมีรายการอยู่จะลบไม่ได้ — ย้ายรายการไปหมวดอื่นก่อน"
          busy={del.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={confirmRemove}
        />
      )}
    </Overlay>
  )
}
