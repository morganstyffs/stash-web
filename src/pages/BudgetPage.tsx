import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  IconFlame,
  IconAlertCircle,
  IconAlertTriangle,
  IconChevronRight,
  IconPlus,
  IconX,
} from '@tabler/icons-react'
import {
  computeBudgetSummary,
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
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { addMonthsToKey, daysLeftInMonthKey, monthKey, parseMonthParam } from '@/lib/dates'
import { formatBaht } from '@/lib/format'
import { translateError } from '@/lib/errors'
import { useDialogA11y } from '@/lib/useDialogA11y'

const RING_C = 2 * Math.PI * 17 // ≈ 107

interface EditorState {
  categoryId: string
  budgetId?: string
  amount: string
}

export function BudgetPage() {
  // Which month the budget screen is showing, from ?m=YYYY-MM (untrusted URL input,
  // validated in parseMonthParam: bad/future → current month). Same pattern as the
  // home screen, so a refresh or SW update stays on the same month and the ‹ / ›
  // stepper is shared (convention 10). Editing budgets is a current-month-only
  // action (see the read-only gating below).
  const [searchParams, setSearchParams] = useSearchParams()
  const month = parseMonthParam(searchParams.get('m'))
  const isCurrent = month === monthKey()
  const goToMonth = (target: string) => {
    const next = new URLSearchParams(searchParams)
    // Drop the param entirely for the current month so it collapses back to "/budget".
    if (target === monthKey()) next.delete('m')
    else next.set('m', target)
    // replace, not push: browsing six months back is one history entry, not six.
    setSearchParams(next, { replace: true })
  }

  const budgetsQ = useBudgets(month)
  const spendingQ = useMonthSpending(month)
  const catsQ = useCategories()
  const upsert = useUpsertBudget()
  const del = useDeleteBudget()
  const toast = useToast()

  const [editor, setEditor] = useState<EditorState | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const budgets = budgetsQ.data ?? []
  const spending = spendingQ.data ?? {}

  // B5: remaining now compares budgeted spend against the budget total (like with
  // like), and off-budget spend is surfaced on its own strip instead of dragging
  // the headline permanently red. daysLeft routes through the shared helper (B6).
  const { totalBudget, usedInBudgeted, offBudget, offBudgetCount, remaining } =
    computeBudgetSummary(budgets, spending)
  const hasBudget = totalBudget > 0
  const overAmount = hasBudget && usedInBudgeted > totalBudget ? usedInBudgeted - totalBudget : 0
  const isOver = overAmount > 0
  // Keyed on the VIEWED month, not "now": a closed month has 0 days left, so the
  // "เหลือ N วัน" line is hidden for it entirely (§11.4-20). Uses the month-keyed
  // helper, never the today-bound one, which would always report the current month.
  const daysLeft = daysLeftInMonthKey(month)

  // Progress bar as two segments in one track (B7 — no Math.min(100, …) clamp).
  // Over budget: the full bar is the used amount, split into within-budget +
  // over. Under budget: the bar fills to used/total, no over segment.
  const inBudgetFrac = isOver
    ? totalBudget / usedInBudgeted
    : hasBudget
      ? usedInBudgeted / totalBudget
      : 0
  const overFrac = isOver ? (usedInBudgeted - totalBudget) / usedInBudgeted : 0

  // expense categories eligible for a (new) budget
  const budgetedIds = new Set(budgets.map((x) => x.category_id))
  const addable = useMemo(
    () =>
      (catsQ.data ?? []).filter(
        (c) => c.kind === 'expense' && !c.is_stock_category && !budgetedIds.has(c.id),
      ),
    [catsQ.data, budgets],
  )

  // The off-budget category with the most spend — where the "นอกงบ" strip lands
  // you in the editor. `addable` already excludes budgeted/stock categories, so
  // any of its ids that carries spending is genuinely off-budget and settable.
  const topOffBudget = useMemo(() => {
    const addableIds = new Set(addable.map((c) => c.id))
    let bestId: string | null = null
    let best = 0
    for (const [id, amount] of Object.entries(spending)) {
      if (addableIds.has(id) && amount > best) {
        best = amount
        bestId = id
      }
    }
    return bestId
  }, [addable, spending])

  const openOffBudget = () => {
    const id = topOffBudget ?? addable[0]?.id
    if (id) setEditor({ categoryId: id, amount: '' })
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between px-[18px] pb-3 pt-[18px]">
        <p className="text-[17px] font-medium">งบประมาณ</p>
        <MonthSwitcher
          month={month}
          isCurrent={isCurrent}
          onPrev={() => goToMonth(addMonthsToKey(month, -1))}
          onNext={() => goToMonth(addMonthsToKey(month, 1))}
        />
      </div>

      {/* hero — a single woven budget label, same fabric as the BUDGET label on
          home so the two screens speak one material language (§11.2). */}
      <div
        className="woven relative mx-4 mb-3 overflow-hidden bg-brand-fabric-budget text-brand-thread shadow-[0_6px_16px_rgba(0,0,0,0.28)]"
        style={{ borderRadius: 3, minHeight: 164 }}
      >
        {/* selvedge edges */}
        <span aria-hidden className="selvedge absolute inset-x-0 top-0 h-[7px]" />
        <span aria-hidden className="selvedge absolute inset-x-0 bottom-0 h-[7px]" />
        <div className="relative px-[18px] pb-[15px] pt-[15px]">
          <p
            className="text-[10px] font-medium uppercase opacity-[.86]"
            style={{ letterSpacing: '0.17em' }}
          >
            BUDGET LEFT
          </p>
          {hasBudget ? (
            <>
              <p className="mt-1 text-[34px] font-semibold leading-tight tabular-nums">
                {formatBaht(remaining)}
              </p>
              <div className="my-2.5 flex h-[7px] overflow-hidden rounded-pill bg-white/15">
                <div
                  className="h-full bg-brand-thread"
                  style={{ width: `${inBudgetFrac * 100}%` }}
                />
                <div className="h-full bg-red-400" style={{ width: `${overFrac * 100}%` }} />
              </div>
              <div className="flex justify-between text-[11px] opacity-[.84]">
                <span>
                  ใช้ไป {formatBaht(usedInBudgeted)} / {formatBaht(totalBudget)}
                </span>
                {/* "days left" is a pace cue that only means something while the
                    month is running — a closed month has none, so hide it (§11.4-20). */}
                {isCurrent && <span>เหลือ {daysLeft} วัน</span>}
              </div>
              {isOver && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-pill bg-white/[0.14] px-[9px] py-[3px] text-[11.5px] font-medium">
                  <IconAlertTriangle size={13} />
                  เกินงบ {formatBaht(overAmount)}
                </span>
              )}
            </>
          ) : (
            <p className="mt-2 text-[15px] opacity-[.9]">ยังไม่ได้ตั้งงบเดือนนี้</p>
          )}
        </div>
      </div>

      {/* off-budget spend — its own strip so it never drags the hero red (B5).
          It's a shortcut into "set a budget for this category", so it only shows on
          the current month; past months are read-only (see งบต่อหมวด header). */}
      {isCurrent && offBudget > 0 && (
        <div className="px-4 pb-4">
          <button
            onClick={openOffBudget}
            className="flex min-h-[44px] w-full items-center gap-2 rounded-[12px] bg-warn-bg px-3.5 py-2.5 text-left text-warn-ink"
          >
            <IconAlertTriangle size={18} className="shrink-0" />
            <span className="min-w-0 flex-1 text-[12.5px]">
              นอกงบ {formatBaht(offBudget)} — มี {offBudgetCount} หมวดที่ใช้เงินแต่ยังไม่ได้ตั้งงบ
            </span>
            <IconChevronRight size={18} className="shrink-0 opacity-60" />
          </button>
        </div>
      )}

      {/* per-category */}
      <div className="mb-1 flex items-center justify-between px-4">
        <p className="text-[13px] font-medium">งบต่อหมวด</p>
        {/* Budgets are a per-month row and CAN be changed retroactively, but there's
            no reason to and it's an easy way to edit the wrong month by mistake — so
            past months are read-only (like §11.4-7: the two mistakes don't cost the
            same). Set/edit/delete are hidden, not just no-ops, so nothing looks
            tappable then silently does nothing. */}
        {isCurrent ? (
          addable.length > 0 && (
            <button
              onClick={() => setEditor({ categoryId: addable[0].id, amount: '' })}
              className="flex items-center gap-1 text-[12px] font-medium text-brand-deep"
            >
              <IconPlus size={14} />
              ตั้งงบเพิ่ม
            </button>
          )
        ) : (
          <span className="text-[12px] text-faint">ดูย้อนหลังได้อย่างเดียว</span>
        )}
      </div>

      <div className="px-4 pb-4">
        {budgets.length > 0 ? (
          budgets.map((bud) => (
            <BudgetRowView
              key={bud.id}
              row={bud}
              used={spending[bud.category_id] ?? 0}
              editable={isCurrent}
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
            {budgetsQ.isLoading
              ? 'กำลังโหลด…'
              : isCurrent
                ? 'ยังไม่ได้ตั้งงบ — แตะ “ตั้งงบเพิ่ม” เพื่อเริ่ม'
                : 'ไม่ได้ตั้งงบในเดือนนี้'}
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
  editable,
  onEdit,
}: {
  row: BudgetRow
  used: number
  /** current month → tap to edit + show pace; past month → static, no pace */
  editable: boolean
  onEdit: () => void
}) {
  const budget = Number(row.amount)
  // Pace ("used faster than the elapsed days") is meaningless once the month is
  // over — no days remain to be ahead or behind of. For a closed month we DON'T
  // call computePace at all (§11.4-20) and show only used / budget / over-or-not.
  const pace = editable ? computePace(used, budget) : null
  const ratio = pace ? pace.ratio : budget > 0 ? used / budget : 0
  const pct = pace ? pace.pct : Math.round(ratio * 100)
  const isOver = pace ? pace.state === 'over' : used > budget && budget > 0
  const isFast = pace?.state === 'fast'
  const arc = Math.min(ratio, 1) * RING_C
  const note = pace
    ? pace.note
    : isOver
      ? `เกินงบ ${Math.round(used - budget).toLocaleString('th-TH')} ฿`
      : 'อยู่ในงบ'

  const noteColor = isOver ? 'text-expense' : isFast ? 'text-warn' : 'text-faint'
  const pctColor = isOver ? 'text-expense' : isFast ? 'text-warn' : 'text-ink'
  const ringColor = isOver ? 'stroke-expense' : isFast ? 'stroke-warn' : 'stroke-brand'

  const inner = (
    <>
      <svg viewBox="0 0 44 44" className="h-[42px] w-[42px] shrink-0">
        <circle cx="22" cy="22" r="17" fill="none" className="stroke-fill" strokeWidth="5" />
        {/* skip the arc entirely at ratio 0 — a round linecap on a 0-length arc
            leaves a stray dot on the ring */}
        {ratio > 0 && (
          <circle
            cx="22"
            cy="22"
            r="17"
            fill="none"
            className={ringColor}
            strokeWidth="5"
            strokeDasharray={`${arc} ${RING_C}`}
            strokeLinecap="round"
            transform="rotate(-90 22 22)"
          />
        )}
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-[13px]">{row.category?.name ?? 'หมวด'}</p>
        <p className={`mt-0.5 text-[11px] ${noteColor}`}>
          {isFast && <IconFlame size={11} className="-mb-px mr-0.5 inline" />}
          {isOver && <IconAlertCircle size={11} className="-mb-px mr-0.5 inline" />}
          {note}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-[12px] font-medium ${pctColor}`}>{pct}%</p>
        <p className="mt-px text-[11px] text-faint">
          {formatBaht(used)}/{budget.toLocaleString('th-TH')}
        </p>
      </div>
    </>
  )

  const rowClass =
    'flex w-full items-center gap-[13px] border-b-[0.5px] border-hairline py-[11px] text-left last:border-b-0'

  // Past months are read-only: render a plain div (no button, nothing tappable)
  // rather than a button whose tap silently does nothing.
  if (!editable) return <div className={rowClass}>{inner}</div>
  return (
    <button onClick={onEdit} className={rowClass}>
      {inner}
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
  const panelRef = useDialogA11y(onClose)
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'แก้งบหมวด' : 'ตั้งงบหมวด'}
        className="w-full max-w-md rounded-t-[22px] bg-white p-5 sm:rounded-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[15px] font-medium">{isEdit ? 'แก้งบหมวด' : 'ตั้งงบหมวด'}</p>
          <button
            aria-label="ปิด"
            onClick={onClose}
            className="-m-2.5 flex h-11 w-11 items-center justify-center rounded-full"
          >
            <IconX size={20} className="text-muted" />
          </button>
        </div>

        <p className="mb-1 ml-0.5 text-[11px] text-faint">หมวด</p>
        {isEdit ? (
          <div className="mb-3 rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px]">
            {categoryName}
          </div>
        ) : (
          <select
            value={state.categoryId}
            onChange={(e) => onChange({ ...state, categoryId: e.target.value })}
            className="mb-3 w-full appearance-none rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-brand"
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
            className="flex-1 rounded-btn bg-brand-deep py-3 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
