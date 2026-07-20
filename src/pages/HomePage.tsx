import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconArrowDownRight, IconArrowUpRight, IconBell } from '@tabler/icons-react'
import { useCategories } from '@/hooks/useLookups'
import {
  computeHomeSummary,
  useMonthTransactions,
  useRecentTransactions,
  type RecentRow,
} from '@/hooks/useHome'
import { Donut, TrendLine } from '@/components/charts'
import { WalletHero } from '@/components/WalletHero'
import { useMonthBudgetTotal } from '@/hooks/useBudgets'
import { TransactionEditSheet } from '@/components/TransactionEditSheet'
import { categoryIcon } from '@/lib/icons'
import { formatBaht, formatMonthLong, formatSigned } from '@/lib/format'

export function HomePage() {
  const navigate = useNavigate()
  const monthQ = useMonthTransactions()
  const catsQ = useCategories()
  const recentQ = useRecentTransactions()
  const budgetTotalQ = useMonthBudgetTotal()
  const headerRef = useRef<HTMLDivElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [hideBalance, setHideBalance] = useState(() => {
    try {
      return localStorage.getItem('stash.hideBalance') === '1'
    } catch {
      return false
    }
  })

  function toggleHideBalance() {
    setHideBalance((v) => {
      const next = !v
      try {
        localStorage.setItem('stash.hideBalance', next ? '1' : '0')
      } catch {
        /* ignore quota / privacy-mode errors */
      }
      return next
    })
  }

  const summary = useMemo(
    () => computeHomeSummary(monthQ.data ?? [], catsQ.data ?? []),
    [monthQ.data, catsQ.data],
  )

  const loading = monthQ.isLoading || catsQ.isLoading

  if (loading) return <HomeSkeleton />

  return (
    <div className="flex min-h-full flex-col">
      {/* header */}
      <div
        ref={headerRef}
        className="flex items-center justify-between px-[18px] pb-2.5 pt-[18px]"
      >
        <Link to="/" aria-label="Stash">
          <img src="/stash-mark.svg" alt="Stash" className="h-[30px] w-[30px]" />
        </Link>
        <p className="text-[17px] font-medium">ยินดีต้อนรับกลับ</p>
        <IconBell size={20} className="text-muted" />
      </div>

      {/* wallet / card-holder hero */}
      <div className="px-4 pb-1 pt-1.5">
        <WalletHero
          income={summary.income}
          incomeCount={summary.incomeCount}
          budgetTotal={budgetTotalQ.data ?? 0}
          expense={summary.expense}
          expenseCount={summary.expenseCount}
          topCategory={summary.donut[0] ?? null}
          safeToSpend={summary.safeToSpend}
          deltaPct={summary.deltaPct}
          hideBalance={hideBalance}
          onToggleHide={toggleHideBalance}
          onQuickAdd={() => navigate('/add')}
          getSafeTopY={() => headerRef.current?.getBoundingClientRect().bottom ?? 0}
        />
      </div>

      {/* month trend (left) + category donut (right), one row on wider screens */}
      <div className="mx-4 mt-3.5 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        {/* left — cumulative in/out trend */}
        <div className="min-w-0 sm:flex-1">
          <div className="mb-1.5 flex items-baseline justify-between">
            <p className="text-[15px] font-medium">{formatMonthLong(new Date())}</p>
            <Link to="/history" className="text-[12px] text-muted">
              ดูทั้งหมด ›
            </Link>
          </div>
          <div className="mb-1.5 flex gap-5">
            <div>
              <p className="text-[11px] text-muted">
                <IconArrowUpRight size={13} className="-mb-0.5 mr-0.5 inline text-income" />
                เงินเข้า
              </p>
              <p className="mt-0.5 text-[15px] font-medium text-income">
                {formatBaht(summary.income)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted">
                <IconArrowDownRight size={13} className="-mb-0.5 mr-0.5 inline text-expense" />
                เงินออก
              </p>
              <p className="mt-0.5 text-[15px] font-medium text-expense">
                {formatBaht(summary.expense)}
              </p>
            </div>
          </div>
          <TrendLine income={summary.dailyCumIncome} expense={summary.dailyCumExpense} />
        </div>

        {/* right — category donut (divider above on mobile, beside on wider) */}
        <div className="border-t-[0.5px] border-hairline pt-3.5 sm:w-[250px] sm:shrink-0 sm:border-l-[0.5px] sm:border-t-0 sm:pl-6 sm:pt-0">
          <p className="mb-3 text-[15px] font-medium">หมวดใช้จ่าย</p>
          {summary.donut.length > 0 ? (
            <div className="flex items-center gap-[18px]">
              <Donut slices={summary.donut} />
              <div className="min-w-0 flex-1">
                {summary.donut.slice(0, 3).map((s) => (
                  <div
                    key={s.categoryId}
                    className="mb-[9px] flex items-center justify-between gap-2 last:mb-0"
                  >
                    <span className="flex min-w-0 items-center text-[13px]">
                      <span
                        className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: s.color }}
                      />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-medium">
                      {formatBaht(s.total)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-3 text-[13px] text-faint">
              {loading ? 'กำลังโหลด…' : 'ยังไม่มีรายจ่ายเดือนนี้'}
            </p>
          )}
        </div>
      </div>

      {/* recent transactions */}
      <div className="mx-4 mb-4 mt-3.5 border-t-[0.5px] border-hairline pt-3.5">
        <p className="mb-1 text-[15px] font-medium">รายการล่าสุด</p>
        {recentQ.data && recentQ.data.length > 0 ? (
          recentQ.data.map((t) => (
            <RecentItem key={t.id} tx={t} onOpen={() => setEditingId(t.id)} />
          ))
        ) : (
          <p className="py-3 text-[13px] text-faint">
            {recentQ.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีรายการ — แตะ “เพิ่มเร็ว” เพื่อเริ่ม'}
          </p>
        )}
      </div>

      {editingId && (
        <TransactionEditSheet id={editingId} onClose={() => setEditingId(null)} />
      )}
    </div>
  )
}

/** Loading placeholder that mirrors the home layout (no ฿0 flash on first load). */
function HomeSkeleton() {
  return (
    <div className="flex min-h-full animate-pulse flex-col">
      <div className="flex items-center justify-between px-[18px] pb-2.5 pt-[18px]">
        <div className="h-[30px] w-[30px] rounded-[9px] bg-fill" />
        <div className="h-4 w-32 rounded bg-fill" />
        <div className="h-5 w-5 rounded bg-fill" />
      </div>
      <div className="px-4 pb-1 pt-1.5">
        <div className="h-[362px] rounded-pocket bg-fill" />
      </div>
      <div className="mx-4 mt-3.5">
        <div className="h-4 w-40 rounded bg-fill" />
        <div className="mt-3 h-[60px] rounded bg-fill" />
      </div>
      <div className="mx-4 mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-[11px]">
            <div className="h-[30px] w-[30px] rounded-[9px] bg-fill" />
            <div className="flex-1">
              <div className="h-3 w-1/2 rounded bg-fill" />
              <div className="mt-1.5 h-2.5 w-1/3 rounded bg-fill" />
            </div>
            <div className="h-3 w-12 rounded bg-fill" />
          </div>
        ))}
      </div>
    </div>
  )
}

function RecentItem({ tx, onOpen }: { tx: RecentRow; onOpen: () => void }) {
  const Icon = categoryIcon(tx.category?.icon)
  const time = new Date(tx.created_at).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-[11px] border-b-[0.5px] border-hairline py-2.5 text-left last:border-b-0"
    >
      <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-fill">
        <Icon size={16} className="text-muted" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px]">{tx.note || tx.category?.name || 'รายการ'}</p>
        <p className="mt-px text-[11px] text-faint">
          {tx.category?.name ?? 'ไม่มีหมวด'} · {time}
        </p>
      </div>
      <span
        className={`text-[13px] font-medium ${
          tx.type === 'income' ? 'text-income' : 'text-expense'
        }`}
      >
        {formatSigned(tx.amount, tx.type)}
      </span>
    </button>
  )
}
