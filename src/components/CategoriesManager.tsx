import { useState } from 'react'
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { Overlay, Toggle } from '@/components/ui'
import { categoryIcon } from '@/lib/icons'
import { useCategories } from '@/hooks/useLookups'
import {
  useDeleteCategory,
  useToggleStockCategory,
  useUpsertCategory,
} from '@/hooks/useSettings'
import type { Category, CategoryKind } from '@/lib/database.types'

interface FormState {
  id?: string
  name: string
  kind: CategoryKind
  is_stock_category: boolean
}

export function CategoriesManager({ onClose }: { onClose: () => void }) {
  const { data: categories } = useCategories()
  const upsert = useUpsertCategory()
  const del = useDeleteCategory()
  const toggle = useToggleStockCategory()
  const [form, setForm] = useState<FormState | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const list = categories ?? []
  const groups: { kind: CategoryKind; label: string }[] = [
    { kind: 'expense', label: 'รายจ่าย' },
    { kind: 'income', label: 'รายรับ' },
  ]

  async function remove(c: Category) {
    setErr(null)
    try {
      await del.mutateAsync(c.id)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <Overlay
      title="หมวดหมู่"
      onClose={onClose}
      action={
        <button
          aria-label="เพิ่มหมวด"
          onClick={() => setForm({ name: '', kind: 'expense', is_stock_category: false })}
        >
          <IconPlus size={20} className="text-mint-deep" />
        </button>
      }
    >
      {err && <p className="mb-2 text-[12px] text-expense">{err}</p>}

      {form && (
        <div className="mb-4 rounded-card border-[0.5px] border-hairline p-3.5">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ชื่อหมวด"
            className="mb-2.5 w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-mint"
          />
          <div className="mb-3 flex gap-1.5">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setForm({ ...form, kind: k })}
                className={`rounded-pill px-4 py-[5px] text-[12px] ${
                  form.kind === k
                    ? 'bg-mint-tint font-medium text-mint-text'
                    : 'border-[0.5px] border-hairline text-muted'
                }`}
              >
                {k === 'expense' ? 'รายจ่าย' : 'รายรับ'}
              </button>
            ))}
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
                await upsert.mutateAsync({
                  id: form.id,
                  name: form.name.trim(),
                  kind: form.kind,
                  is_stock_category: form.is_stock_category,
                })
                setForm(null)
              }}
              className="flex-1 rounded-btn bg-mint-deep py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
            >
              บันทึก
            </button>
          </div>
        </div>
      )}

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
                    <Icon size={16} className="text-muted" />
                  </div>
                  <span className="flex-1 truncate text-[13.5px]">{c.name}</span>
                  {c.kind === 'expense' && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-faint">สต็อก</span>
                      <Toggle
                        on={c.is_stock_category}
                        onChange={(v) => toggle.mutate({ id: c.id, value: v })}
                        label={`ลงสต็อกอัตโนมัติ ${c.name}`}
                      />
                    </div>
                  )}
                  <button
                    aria-label="แก้ไข"
                    onClick={() =>
                      setForm({
                        id: c.id,
                        name: c.name,
                        kind: c.kind,
                        is_stock_category: c.is_stock_category,
                      })
                    }
                  >
                    <IconPencil size={16} className="text-faint" />
                  </button>
                  <button aria-label="ลบ" onClick={() => remove(c)}>
                    <IconTrash size={16} className="text-faint" />
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}
    </Overlay>
  )
}
