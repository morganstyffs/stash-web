import { useEffect, useMemo, useState } from 'react'
import { IconAdjustmentsHorizontal, IconBox, IconSearch } from '@tabler/icons-react'
import {
  groupByDay,
  useHistory,
  type HistoryFilter,
  type HistoryRow,
} from '@/hooks/useHistory'
import { categoryIcon } from '@/lib/icons'
import { formatBaht, formatSigned } from '@/lib/format'

const FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'income', label: 'รายรับ' },
  { key: 'expense', label: 'รายจ่าย' },
  { key: 'stock', label: 'สต็อก' },
]

export function HistoryPage() {
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  // debounce search → one query per pause, not per keystroke
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading } = useHistory(filter, search)
  const groups = useMemo(() => groupByDay(data ?? []), [data])

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between px-[18px] pb-3.5 pt-[18px]">
        <p className="text-[17px] font-medium">ประวัติ</p>
        <IconAdjustmentsHorizontal size={19} className="text-muted" />
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 rounded-[11px] border-[0.5px] border-hairline bg-fill px-3 py-[9px]">
          <IconSearch size={16} className="text-faint" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="ค้นหารายการ..."
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
          />
        </div>
      </div>

      <div className="no-scrollbar flex gap-[7px] overflow-x-auto px-4 pb-2">
        {FILTERS.map((f) => {
          const active = f.key === filter
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-pill px-[14px] py-1.5 text-[12px] ${
                active
                  ? 'bg-mint-tint font-medium text-mint-text'
                  : 'border-[0.5px] border-hairline text-muted'
              }`}
            >
              {f.label}
            </button>
          )
        })}
      </div>

      <div className="px-4 pb-4">
        {groups.length > 0 ? (
          groups.map((g) => (
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
                <LedgerRow key={r.id} row={r} />
              ))}
            </div>
          ))
        ) : (
          <p className="py-10 text-center text-[13px] text-faint">
            {isLoading ? 'กำลังโหลด…' : 'ไม่พบรายการ'}
          </p>
        )}
      </div>
    </div>
  )
}

function LedgerRow({ row }: { row: HistoryRow }) {
  const isStock = row.is_stock_purchase || row.stock_item_id != null
  const Icon = isStock ? IconBox : categoryIcon(row.category?.icon)
  const time = new Date(row.created_at).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <div className="flex items-center gap-[11px] border-b-[0.5px] border-hairline py-2.5 last:border-b-0">
      <div
        className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] ${
          isStock ? 'bg-mint-tint' : 'bg-fill'
        }`}
      >
        <Icon size={16} className={isStock ? 'text-mint-deep' : 'text-muted'} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px]">{row.note || row.category?.name || 'รายการ'}</p>
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
    </div>
  )
}
