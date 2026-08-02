import { useState } from 'react'
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { Overlay } from '@/components/ui'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { categoryIcon, ICON_NAMES } from '@/lib/icons'
import { catColorVar } from '@/lib/catColor'
import { useCategories } from '@/hooks/useLookups'
import { useDeleteCategory, useSetCategoryRole, useUpsertCategory } from '@/hooks/useSettings'
import { translateError } from '@/lib/errors'
import type { Category, CategoryKind } from '@/lib/db'

interface FormState {
  id?: string
  name: string
  kind: CategoryKind
  is_stock_category: boolean
  is_shop_category: boolean
  is_system: boolean
  icon: string
  /** chosen slot 1–6, or null (create only) = let the DB assign an unused one */
  colorIndex: number | null
}

const COLOR_SLOTS = [1, 2, 3, 4, 5, 6] as const

/** One category plays exactly one of three roles. The two boolean columns are
 *  mutually exclusive, so a single control reflects that truth better than two
 *  look-alike switches the user has to reason about. */
type CategoryRole = 'general' | 'stock' | 'shop'

/** Which columns each role writes — the single source that keeps the (stock,
 *  shop) pair from ever being (true, true). */
const ROLE_COLUMNS: Record<CategoryRole, { is_stock_category: boolean; is_shop_category: boolean }> = {
  general: { is_stock_category: false, is_shop_category: false },
  stock: { is_stock_category: true, is_shop_category: false },
  shop: { is_stock_category: false, is_shop_category: true },
}

function roleOf(c: { is_stock_category: boolean; is_shop_category: boolean }): CategoryRole {
  if (c.is_stock_category) return 'stock'
  if (c.is_shop_category) return 'shop'
  return 'general'
}

/** Screen labels only — the DB columns/variables keep their names. ส่วนตัว is the
 *  default almost every category has, so it is the one role we DON'T badge in the
 *  list (badging it everywhere would just bring back the clutter we're removing). */
const ROLE_LABEL: Record<CategoryRole, string> = {
  general: 'ส่วนตัว',
  stock: 'เติมสต็อก',
  shop: 'ของร้าน',
}

/** What each role means, in a person's words — shown under the picker in the
 *  edit / create sheet, where the choice is actually being made. */
const ROLE_DESC: Record<CategoryRole, string> = {
  general: 'รายจ่ายทั่วไป กินงบประจำเดือน',
  stock: 'ซื้อของมาขาย ไม่นับเป็นรายจ่าย แต่เป็นการเอาเงินไปแลกเป็นของ',
  shop: 'เงินที่จ่ายในหมวดนี้จะไม่กินงบส่วนตัว แต่ยังนับเป็นเงินที่จ่ายออกไป',
}

/** The extra warning shown ONLY when picking ของร้าน on a category that already
 *  exists (the edit sheet) — moving an in-use category re-does past-month shop
 *  profit. A brand-new category has nothing linked yet, so this never appears in
 *  the create form. */
const SHOP_EDIT_WARNING = 'ถ้าย้ายทีหลัง กำไรร้านของเดือนก่อน ๆ จะคิดใหม่ตามด้วย'

/** expense can be any of the three; income has no stock intake (buying stock is
 *  always an expense). */
const ROLES_BY_KIND: Record<CategoryKind, CategoryRole[]> = {
  expense: ['general', 'stock', 'shop'],
  income: ['general', 'shop'],
}

/** The single role picker — used by BOTH the create form and the edit sheet, so
 *  the two never drift. A radiogroup makes the exclusivity visible in the shape;
 *  the description tracks the selected role, and the shop history-rewrite warning
 *  is passed in (edit only) so it never shows on a brand-new category. */
function RolePicker({
  options,
  value,
  onChange,
  disabled = false,
  showShopWarning = false,
}: {
  options: CategoryRole[]
  value: CategoryRole
  onChange: (v: CategoryRole) => void
  disabled?: boolean
  showShopWarning?: boolean
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">บทบาท</p>
      <div
        role="radiogroup"
        aria-label="บทบาทของหมวด"
        className={`flex gap-1.5 ${disabled ? 'opacity-40' : ''}`}
      >
        {options.map((r) => {
          const selected = r === value
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(r)}
              className={`min-h-[44px] flex-1 rounded-pill px-2 text-[12px] ${
                selected
                  ? 'bg-brand-tint font-medium text-brand-ink'
                  : 'border-[0.5px] border-hairline text-muted'
              }`}
            >
              {ROLE_LABEL[r]}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
        {disabled ? 'หมวดของระบบ ปรับไม่ได้' : ROLE_DESC[value]}
      </p>
      {!disabled && showShopWarning && value === 'shop' && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-warn-ink">{SHOP_EDIT_WARNING}</p>
      )}
    </div>
  )
}

/** A one-glance marker in the list. System categories read as ระบบ; a category
 *  the user has moved off the default shows its role — but ส่วนตัว (the default)
 *  is left unbadged so the common case stays clean. */
function RoleBadge({ category }: { category: Category }) {
  const label = category.is_system ? 'ระบบ' : null
  const role = roleOf(category)
  const text = label ?? (role === 'general' ? null : ROLE_LABEL[role])
  if (!text) return null
  return (
    <span className="shrink-0 rounded-pill bg-fill px-2 py-[3px] text-[10.5px] font-medium text-muted">
      {text}
    </span>
  )
}

export function CategoriesManager({ onClose }: { onClose: () => void }) {
  const { data: categories } = useCategories()
  const upsert = useUpsertCategory()
  const del = useDeleteCategory()
  const setRole = useSetCategoryRole()
  const toast = useToast()

  const [form, setForm] = useState<FormState | null>(null)
  const [confirming, setConfirming] = useState<Category | null>(null)

  /** Apply a role to the open form. State always updates so the picker reflects
   *  the choice; on an EXISTING category we also persist immediately through
   *  useSetCategoryRole — both columns in one write, so a เติมสต็อก → ของร้าน
   *  switch never leaves a (true, true) row that would trip the DB CHECK, and the
   *  transactions cache is invalidated (a shop-flag change re-does past months). */
  async function applyRole(f: FormState, role: CategoryRole) {
    const cols = ROLE_COLUMNS[role]
    setForm({ ...f, ...cols })
    if (!f.id) return
    if (cols.is_stock_category === f.is_stock_category && cols.is_shop_category === f.is_shop_category)
      return
    try {
      await setRole.mutateAsync({ id: f.id, ...cols })
    } catch (e) {
      // Should be unreachable — the picker is disabled on system categories
      // (mirrors the DB CHECK) — but rule 16: if 23514 fires anyway, tell the user.
      toast.error(translateError(e))
    }
  }

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
            setForm({
              name: '',
              kind: 'expense',
              is_stock_category: false,
              is_shop_category: false,
              is_system: false,
              icon: 'tag',
              colorIndex: null,
            })
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
                onClick={() => {
                  // Switching kind can strip a role the new kind doesn't offer
                  // (เติมสต็อก is expense-only) — reset it to ส่วนตัว so the picker
                  // never stays on a value it can no longer show as selected.
                  const role = roleOf(form)
                  const patch = ROLES_BY_KIND[k].includes(role) ? {} : ROLE_COLUMNS.general
                  setForm({ ...form, kind: k, ...patch })
                }}
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

          {/* Role — same picker for create and edit. The shop history warning is
              edit-only (form.id present); a new category has nothing to re-do. */}
          <div className="mb-3">
            <RolePicker
              options={ROLES_BY_KIND[form.kind]}
              value={roleOf(form)}
              disabled={form.is_system}
              showShopWarning={!!form.id}
              onChange={(r) => applyRole(form, r)}
            />
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

      <p className="mb-3 text-[11px] leading-relaxed text-faint">
        แตะดินสอเพื่อเปลี่ยนชื่อ ไอคอน หรือย้ายหมวดไปเป็นของร้าน
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
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{c.name}</span>
                  <RoleBadge category={c} />
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
                        is_system: c.is_system,
                        icon: c.icon,
                        colorIndex: c.color_index,
                      })
                    }
                  >
                    <IconPencil size={16} className="text-faint" />
                  </button>
                  {/* System categories can never be deleted (DB rejects with
                      23001) — the user knows that up front, so a button that's
                      guaranteed to fail just wastes space. Non-system deletes
                      stay: the user can't know a category has transactions until
                      they try. */}
                  {!c.is_system && (
                    <button
                      aria-label="ลบ"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-expense-bg disabled:opacity-50"
                      disabled={del.isPending}
                      onClick={() => setConfirming(c)}
                    >
                      <IconTrash size={16} className="text-faint" />
                    </button>
                  )}
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
