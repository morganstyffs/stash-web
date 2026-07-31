import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  IconChartBar,
  IconSearch,
  IconX,
  IconBox,
  IconLock,
  IconChevronDown,
} from '@tabler/icons-react'
import {
  groupByDay,
  useHistory,
  type HistoryFilter,
  type HistoryRow,
} from '@/hooks/useHistory'
import { TransactionEditSheet } from '@/components/TransactionEditSheet'
import { MonthFilterSheet } from '@/components/MonthFilterSheet'
import { LedgerIcon } from '@/components/LedgerIcon'
import { useToast } from '@/components/Toast'
import { lockedRowInfo } from '@/lib/ledger'
import { translateError } from '@/lib/errors'
import { categoryIcon } from '@/lib/icons'
import { catColorVar } from '@/lib/catColor'
import { monthAnchorFromKey, parseOptionalMonthParam } from '@/lib/dates'
import { formatBaht, formatMonthShort, formatSigned } from '@/lib/format'

const FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'income', label: 'รายรับ' },
  { key: 'expense', label: 'รายจ่าย' },
  { key: 'stock', label: 'สต็อก' },
]

const FILTER_KEYS = FILTERS.map((f) => f.key)

function isFilter(v: string | null): v is HistoryFilter {
  return v != null && (FILTER_KEYS as string[]).includes(v)
}

export function HistoryPage() {
  // Allow deep-linking a filter, e.g. /history?filter=income from the home hero.
  const [searchParams, setSearchParams] = useSearchParams()
  const initialFilter = searchParams.get('filter')
  const [filter, setFilter] = useState<HistoryFilter>(
    isFilter(initialFilter) ? initialFilter : 'all',
  )
  // The month filter lives in the URL (?m=YYYY-MM) so it survives a refresh / SW
  // update and can be deep-linked; '' = every month, which is the default the page
  // has always shown. Untrusted URL input, validated the same way as the home
  // screen — except here a bad/future/missing value means "no filter", not the
  // current month (parseOptionalMonthParam, convention 10: no second regex).
  const month = parseOptionalMonthParam(searchParams.get('m'))
  const setMonth = (target: string) => {
    const next = new URLSearchParams(searchParams)
    if (target) next.set('m', target)
    else next.delete('m')
    // replace, not push: picking through months is one history entry, not a stack.
    setSearchParams(next, { replace: true })
  }
  const monthLabel = month ? formatMonthShort(monthAnchorFromKey(month)) : 'ทุกเดือน'
  const [monthSheetOpen, setMonthSheetOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const toast = useToast()

  // debounce search → one query per pause, not per keystroke
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useHistory(
    filter,
    search,
    month,
  )
  const rows = useMemo(() => data?.pages.flatMap((p) => p.rows) ?? [], [data])
  const groups = useMemo(() => groupByDay(rows), [rows])
  // Every page carries the same whole-match-set totals; the first page is enough.
  const totals = data?.pages[0]?.totals
  const filterLabel = FILTERS.find((f) => f.key === filter)?.label

  // The list + its totals now ride one RPC; if it fails, the screen would just go
  // empty and silent, which is worse than the old two-query path. Surface it.
  useEffect(() => {
    if (error) toast.error(`ค้นหาประวัติไม่ทำงาน: ${translateError(error)}`)
  }, [error, toast])

  return (
    <div className="flex min-h-full flex-col">
      <div className="px-[18px] pb-3.5 pt-[18px]">
        <p className="text-[17px] font-medium">ประวัติ</p>
      </div>

      <div className="px-4 pb-3">
        <div className="flex h-11 items-center gap-2 rounded-input border-[0.5px] border-hairline bg-fill px-3">
          <IconSearch size={17} className="shrink-0 text-faint" aria-hidden />
          <input
            aria-label="ค้นหารายการ"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="ค้นหาโน้ต · หมวด · ยอดเงิน"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
          />
          {searchInput && (
            <button
              aria-label="ล้างคำค้นหา"
              onClick={() => setSearchInput('')}
              className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center"
            >
              <IconX size={16} className="text-faint" />
            </button>
          )}
        </div>
      </div>

      <div className="no-scrollbar flex gap-[7px] overflow-x-auto px-4 pb-2">
        {FILTERS.map((f) => {
          const active = f.key === filter
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className="flex min-h-[44px] shrink-0 items-center"
            >
              <span
                className={`rounded-pill px-[14px] py-1.5 text-[12px] ${
                  active
                    ? 'bg-brand-tint font-medium text-brand-ink'
                    : 'border-[0.5px] border-hairline text-muted'
                }`}
              >
                {f.label}
              </span>
            </button>
          )
        })}
        {/* Month picker — a pill on the same filter row that opens a sheet (not a
            native month input, which iOS renders as an empty text box). Tinted
            like a pressed chip when a month is active, so "I'm filtering a month"
            reads at a glance. */}
        <button
          type="button"
          onClick={() => setMonthSheetOpen(true)}
          aria-haspopup="dialog"
          aria-label={`เลือกเดือน · ${monthLabel}`}
          className="flex min-h-[44px] shrink-0 items-center"
        >
          <span
            className={`flex items-center gap-1 rounded-pill px-[14px] py-1.5 text-[12px] ${
              month
                ? 'bg-brand-tint font-medium text-brand-ink'
                : 'border-[0.5px] border-hairline text-muted'
            }`}
          >
            {monthLabel}
            <IconChevronDown size={13} aria-hidden />
          </span>
        </button>
      </div>

      {totals && totals.count > 0 && (
        <div className="mx-4 mb-1 mt-2.5 flex items-center gap-3 rounded-[14px] bg-brand-tint px-[15px] py-3">
          <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-white">
            <IconChartBar size={18} className="text-brand-ink" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-brand-ink">
              {totals.count} รายการ{filterLabel ? ` (${filterLabel})` : ''}
            </p>
            <p className="mt-px text-[11px]">
              <span className="text-income">+{formatBaht(totals.income)}</span>
              {' · '}
              <span className="text-expense">-{formatBaht(totals.expense)}</span>
            </p>
          </div>
        </div>
      )}

      <div className="px-4 pb-4">
        {isLoading ? (
          <HistorySkeleton />
        ) : groups.length > 0 ? (
          <>
            {groups.map((g) => (
              <div key={g.key}>
                <div className="flex items-baseline justify-between pb-1 pt-3">
                  <span className="text-[13px] font-medium">
                    {g.label}
                    {g.sub && <span className="font-normal text-faint"> · {g.sub}</span>}
                  </span>
                  <span className="text-[11px] text-faint">
                    <span className="text-income">+{formatBaht(g.income)}</span> ·{' '}
                    <span className="text-expense">-{formatBaht(g.expense)}</span>
                  </span>
                </div>
                {g.rows.map((r) => (
                  <LedgerRow key={r.id} row={r} onOpen={() => setEditingId(r.id)} />
                ))}
              </div>
            ))}

            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="mt-4 w-full rounded-btn border-[0.5px] border-hairline py-2.5 text-[13px] font-medium text-muted disabled:opacity-50"
              >
                {isFetchingNextPage ? 'กำลังโหลด…' : 'โหลดเพิ่ม'}
              </button>
            )}
          </>
        ) : (
          // Name the month when one is filtered, so an empty month reads as "nothing
          // logged in ก.ค. 2569" rather than a bare "ไม่พบรายการ" that looks like lost data.
          <p className="py-10 text-center text-[13px] text-faint">
            {month ? `ไม่มีรายการใน ${monthLabel}` : 'ไม่พบรายการ'}
          </p>
        )}
      </div>

      {monthSheetOpen && (
        <MonthFilterSheet month={month} onSelect={setMonth} onClose={() => setMonthSheetOpen(false)} />
      )}

      {editingId && (
        <TransactionEditSheet id={editingId} onClose={() => setEditingId(null)} />
      )}
    </div>
  )
}

/** Placeholder rows shown while the first page loads (no ฿0 flash). */
function HistorySkeleton() {
  return (
    <div className="animate-pulse pt-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-[11px] py-2.5">
          <div className="h-[30px] w-[30px] shrink-0 rounded-[9px] bg-fill" />
          <div className="flex-1">
            <div className="h-3 w-1/2 rounded bg-fill" />
            <div className="mt-1.5 h-2.5 w-1/3 rounded bg-fill" />
          </div>
          <div className="h-3 w-12 rounded bg-fill" />
        </div>
      ))}
    </div>
  )
}

function LedgerRow({ row, onOpen }: { row: HistoryRow; onOpen: () => void }) {
  const lock = lockedRowInfo(row)
  const isStock = lock?.kind === 'stock_purchase' || lock?.kind === 'stock_sale'
  const Icon = isStock ? IconBox : categoryIcon(row.category?.icon)
  const time = new Date(row.created_at).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-[11px] border-b-[0.5px] border-hairline py-2.5 text-left last:border-b-0"
    >
      <LedgerIcon
        icon={Icon}
        color={isStock ? 'rgb(var(--color-brand-deep))' : catColorVar(row.category?.color_index)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="truncate text-[13px]">{row.note || row.category?.name || 'รายการ'}</p>
          {lock && <IconLock size={12} aria-label="ล็อก" className="shrink-0 text-faint" />}
        </div>
        <p className="mt-px text-[11px] text-faint">
          {row.category?.name ?? (isStock ? 'สต็อก' : 'ไม่มีหมวด')} · {time}
        </p>
      </div>
      <span
        className={`text-[13px] font-medium ${
          row.type === 'income' ? 'text-income' : 'text-expense'
        }`}
      >
        {formatSigned(row.amount, row.type)}
      </span>
    </button>
  )
}
