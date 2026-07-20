import { useMemo, useState } from 'react'
import { IconFlame, IconAlertCircle, IconPlus } from '@tabler/icons-react'
import {
  computePace,
  useBudgets,
  useDeleteBudget,
  useMonthSpending,
  useUpsertBudget,
  type BudgetRow,
} from '@/hooks/useBudgets'
import { useCategories } from '@/hooks/useLookups'
import { useToast } from '@/components/Toast'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { monthBounds } from '@/lib/dates'
import { formatBaht, formatMonthShort } from '@/lib/format'
import { translateError } from '@/lib/errors'

const RING_C = 2 * Math.PI * 17 // ≈ 107

interface EditorState {
  categoryId: string
  budgetId?: string
  amount: string
}

export function BudgetPage() {
  const budgetsQ = useBudgets()
  const spendingQ = useMonthSpending()
  const catsQ = useCategories()
  const upsert = useUpsertBudget()
  const del = useDeleteBudget()
  const toast = useToast()

  const [editor, setEditor] = useState<EditorState | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const budgets = budgetsQ.data ?? []
  const spending = spendingQ.data ?? {}

  const totalBudget = budgets.reduce((s, b) => s + Number(b.amount), 0)
  const totalUsed = Object.values(spending).reduce((s, v) => s + v, 0)
  const remaining = totalBudget - totalUsed
  const usedPct = totalBudget > 0 ? Math.min(100, (totalUsed / totalBudget) * 100) : 0

  const b = monthBounds()
  const daysLeft = b.days - new Date().getDate()

  // expense categories eligible for a (new) budget
  const budgetedIds = new Set(budgets.map((x) => x.category_id))
  const addable = useMemo(
    () =>
      (catsQ.data ?? []).filter(
        (c) => c.kind === 'expense' && !c.is_stock_category && !budgetedIds.has(c.id),
      ),
    [catsQ.data, budgets],
  )

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between px-[18px] pb-3 pt-[18px]">
        <p className="text-[17px] font-medium">งบประมาณ</p>
        <span className="rounded-pill border-[0.5px] border-hairline px-3 py-[5px] text-[12px] text-muted">
          {formatMonthShort(new Date())}
        </span>
      </div>

      {/* hero */}
      <div className="relative mx-4 mb-4 rounded-pocket bg-mint-deep px-4 pb-[15px] pt-[18px]">
        <div className="pointer-events-none absolute inset-1.5 rounded-[12px] border-[1.5px] border-dashed border-white/[0.22]" />
        <div className="relative">
          <p className="text-[12px] text-white/70">งบคงเหลือเดือนนี้</p>
          <p className="mt-1 text-[30px] font-medium tracking-[-0.5px] text-white">
            {formatBaht(remaining)}
          </p>
          <div className="my-2.5 h-1.5 overflow-hidden rounded-pill bg-white/20">
            <div className="h-full rounded-pill bg-mint-hero" style={{ width: `${usedPct}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-white/80">
            <span>
              ใช้ไป {formatBaht(totalUsed)} / {formatBaht(totalBudget)}
            </span>
            <span>เหลือ {daysLeft} วัน</span>
          </div>
        </div>
      </div>

      {/* per-category */}
      <div className="mb-1 flex items-center justify-between px-4">
        <p className="text-[13px] font-medium">งบต่อหมวด</p>
        {addable.length > 0 && (
          <button
            onClick={() => setEditor({ categoryId: addable[0].id, amount: '' })}
            className="flex items-center gap-1 text-[12px] font-medium text-mint-deep"
          >
            <IconPlus size={14} />
            ตั้งงบเพิ่ม
          </button>
        )}
      </div>

      <div className="px-4 pb-4">
        {budgets.length > 0 ? (
          budgets.map((bud) => (
            <BudgetRowView
              key={bud.id}
              row={bud}
              used={spending[bud.category_id] ?? 0}
              onEdit={() =>
                setEditor({
                  categoryId: bud.category_id,
                  budgetId: bud.id,
                  amount: String(bud.amount),
                })
              }
            />
          ))
        ) : (
          <p className="py-8 text-center text-[13px] text-faint">
            {budgetsQ.isLoading ? 'กำลังโหลด…' : 'ยังไม่ได้ตั้งงบ — แตะ “ตั้งงบเพิ่ม” เพื่อเริ่ม'}
          </p>
        )}
      </div>

      {editor && (
        <BudgetEditor
          state={editor}
          categoryName={
            budgets.find((x) => x.category_id === editor.categoryId)?.category?.name ??
            catsQ.data?.find((c) => c.id === editor.categoryId)?.name ??
            ''
          }
          addable={addable}
          isEdit={!!editor.budgetId}
          saving={upsert.isPending}
          onChange={setEditor}
          onSave={async () => {
            try {
              await upsert.mutateAsync({
                categoryId: editor.categoryId,
                amount: Number(editor.amount || '0'),
              })
              toast.success('บันทึกงบแล้ว')
              setEditor(null)
            } catch (e) {
              toast.error(translateError(e))
            }
          }}
          onDelete={editor.budgetId ? () => setConfirmingDelete(true) : undefined}
          onClose={() => setEditor(null)}
        />
      )}

      {confirmingDelete && editor?.budgetId && (
        <ConfirmDialog
          title="ลบงบหมวดนี้?"
          message="งบของหมวดนี้จะถูกลบ — ธุรกรรมที่บันทึกไว้ยังอยู่เหมือนเดิม"
          busy={del.isPending}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={async () => {
            try {
              await del.mutateAsync(editor.budgetId!)
              toast.success('ลบงบแล้ว')
              setConfirmingDelete(false)
              setEditor(null)
            } catch (e) {
              toast.error(translateError(e))
            }
          }}
        />
      )}
    </div>
  )
}

function BudgetRowView({
  row,
  used,
  onEdit,
}: {
  row: BudgetRow
  used: number
  onEdit: () => void
}) {
  const pace = computePace(used, Number(row.amount))
  const arc = Math.min(pace.ratio, 1) * RING_C
  const noteColor =
    pace.state === 'over' ? 'text-expense' : pace.state === 'fast' ? 'text-warn' : 'text-faint'
  const pctColor =
    pace.state === 'over' ? 'text-expense' : pace.state === 'fast' ? 'text-warn' : 'text-ink'

  return (
    <button
      onClick={onEdit}
      className="flex w-full items-center gap-[13px] border-b-[0.5px] border-hairline py-[11px] text-left last:border-b-0"
    >
      <svg viewBox="0 0 44 44" className="h-[42px] w-[42px] shrink-0">
        <circle cx="22" cy="22" r="17" fill="none" stroke="#F1F2F3" strokeWidth="5" />
        <circle
          cx="22"
          cy="22"
          r="17"
          fill="none"
          stroke={pace.color}
          strokeWidth="5"
          strokeDasharray={`${arc} ${RING_C}`}
          strokeLinecap="round"
          transform="rotate(-90 22 22)"
        />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-[13px]">{row.category?.name ?? 'หมวด'}</p>
        <p className={`mt-0.5 text-[11px] ${noteColor}`}>
          {pace.state === 'fast' && <IconFlame size={11} className="-mb-px mr-0.5 inline" />}
          {pace.state === 'over' && (
            <IconAlertCircle size={11} className="-mb-px mr-0.5 inline" />
          )}
          {pace.note}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-[12px] font-medium ${pctColor}`}>{pace.pct}%</p>
        <p className="mt-px text-[11px] text-faint">
          {formatBaht(used)}/{Number(row.amount).toLocaleString('th-TH')}
        </p>
      </div>
    </button>
  )
}

function BudgetEditor({
  state,
  categoryName,
  addable,
  isEdit,
  saving,
  onChange,
  onSave,
  onDelete,
  onClose,
}: {
  state: EditorState
  categoryName: string
  addable: { id: string; name: string }[]
  isEdit: boolean
  saving: boolean
  onChange: (s: EditorState) => void
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[22px] bg-white p-5 sm:rounded-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4 text-[15px] font-medium">{isEdit ? 'แก้งบหมวด' : 'ตั้งงบหมวด'}</p>

        <p className="mb-1 ml-0.5 text-[11px] text-faint">หมวด</p>
        {isEdit ? (
          <div className="mb-3 rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px]">
            {categoryName}
          </div>
        ) : (
          <select
            value={state.categoryId}
            onChange={(e) => onChange({ ...state, categoryId: e.target.value })}
            className="mb-3 w-full appearance-none rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-mint"
          >
            {addable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        <p className="mb-1 ml-0.5 text-[11px] text-faint">งบต่อเดือน</p>
        <div className="mb-5 flex items-center rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5">
          <span className="mr-1 text-[13px] text-faint">฿</span>
          <input
            autoFocus
            value={state.amount}
            onChange={(e) =>
              onChange({ ...state, amount: e.target.value.replace(/[^0-9.]/g, '') })
            }
            inputMode="decimal"
            placeholder="0"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
          />
        </div>

        <div className="flex gap-2.5">
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-btn border-[0.5px] border-hairline px-4 py-3 text-[14px] font-medium text-expense"
            >
              ลบ
            </button>
          )}
          <button
            onClick={onSave}
            disabled={saving || !state.categoryId || Number(state.amount || '0') <= 0}
            className="flex-1 rounded-btn bg-mint-deep py-3 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
