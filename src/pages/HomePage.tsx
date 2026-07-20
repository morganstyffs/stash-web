import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconBell,
  IconBolt,
  IconChevronRight,
  IconDots,
  IconEye,
  IconMicrophone,
  IconScan,
} from '@tabler/icons-react'
import { useCategories } from '@/hooks/useLookups'
import {
  computeHomeSummary,
  useMonthTransactions,
  useRecentTransactions,
  type RecentRow,
} from '@/hooks/useHome'
import { Donut, TrendLine } from '@/components/charts'
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
  const [editingId, setEditingId] = useState<string | null>(null)

  const summary = useMemo(
    () => computeHomeSummary(monthQ.data ?? [], catsQ.data ?? []),
    [monthQ.data, catsQ.data],
  )

  const loading = monthQ.isLoading || catsQ.isLoading

  if (loading) return <HomeSkeleton />

  return (
    <div className="flex min-h-full flex-col">
      {/* header */}
      <div className="flex items-center justify-between px-[18px] pb-2.5 pt-[18px]">
        <Link to="/" aria-label="Stash">
          <img src="/stash-mark.svg" alt="Stash" className="h-[30px] w-[30px]" />
        </Link>
        <p className="text-[17px] font-medium">ยินดีต้อนรับกลับ</p>
        <IconBell size={20} className="text-muted" />
      </div>

      {/* summary strips + safe-to-spend hero */}
      <div className="px-4 pb-1 pt-1.5">
        <div className="flex items-center justify-between rounded-[14px] bg-cat-green px-4 py-[9px]">
          <span className="text-[13px] font-medium text-cat-green-ink">รายรับเดือนนี้</span>
          <span className="text-[13px] font-medium text-cat-green-ink">
            {formatBaht(summary.income)}
          </span>
        </div>
        <Link
          to="/budget"
          className="-mt-1.5 flex items-center justify-between rounded-[14px] bg-cat-yellow px-4 py-[9px]"
        >
          <span className="text-[13px] font-medium text-cat-yellow-ink">งบที่ตั้งไว้</span>
          <span className="flex items-center gap-1 text-[13px] font-medium text-cat-yellow-ink">
            {formatBaht(budgetTotalQ.data ?? 0)}
            <IconChevronRight size={14} className="opacity-60" />
          </span>
        </Link>
        <div className="-mt-1.5 flex items-center justify-between rounded-[14px] bg-cat-black px-4 py-[9px]">
          <span className="text-[13px] font-medium text-cat-black-ink">รายจ่ายเดือนนี้</span>
          <span className="text-[13px] font-medium text-cat-black-ink">
            {formatBaht(summary.expense)}
          </span>
        </div>

        <div className="relative -mt-2 rounded-pocket bg-mint-deep px-4 pb-3.5 pt-[18px]">
          <div className="pointer-events-none absolute inset-1.5 rounded-[12px] border-[1.5px] border-dashed border-white/[0.22]" />
          <div className="relative">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] text-white/70">เหลือใช้ได้เดือนนี้</p>
                <p className="mt-1 flex items-center gap-1.5 text-[30px] font-medium tracking-[-0.5px] text-white">
                  {formatBaht(summary.safeToSpend)}
                  <IconEye size={16} className="text-white/60" />
                </p>
              </div>
              <span className="rounded-pill border border-white/30 px-3 py-[5px] text-[12px] text-white">
                เดือนนี้
              </span>
            </div>

            {summary.deltaPct != null && (
              <span className="mt-2 inline-block rounded-pill bg-mint-hero px-[9px] py-[3px] text-[11px] font-medium text-mint-text">
                {summary.deltaPct >= 0 ? '▲' : '▼'} {Math.abs(summary.deltaPct)}%{' '}
                {summary.deltaPct >= 0 ? 'ดีกว่า' : 'ต่ำกว่า'}เดือนก่อน
              </span>
            )}

            <div className="mt-4 flex gap-2">
              <HeroAction icon={IconBolt} label="เพิ่มเร็ว" onClick={() => navigate('/add')} />
              <HeroAction icon={IconScan} label="สแกนสลิป" />
              <HeroAction icon={IconMicrophone} label="พิมพ์/พูด" />
              <HeroAction icon={IconDots} label="อื่นๆ" />
            </div>
          </div>
        </div>
      </div>

      {/* month trend */}
      <div className="mx-4 mt-3.5">
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
        <TrendLine data={summary.dailyCumExpense} />
        <div className="mt-0.5 flex justify-between text-[10px] text-muted">
          <span>1</span>
          <span>10</span>
          <span>20</span>
          <span>30</span>
        </div>
      </div>

      {/* category donut */}
      <div className="mx-4 mt-3.5 border-t-[0.5px] border-hairline pt-3.5">
        <p className="mb-3 text-[15px] font-medium">หมวดใช้จ่าย</p>
        {summary.donut.length > 0 ? (
          <div className="flex items-center gap-[18px]">
            <Donut slices={summary.donut} />
            <div className="flex-1">
              {summary.donut.slice(0, 3).map((s) => (
                <div
                  key={s.categoryId}
                  className="mb-[9px] flex items-center justify-between last:mb-0"
                >
                  <span className="text-[13px]">
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: s.color }}
                    />
                    {s.name}
                  </span>
                  <span className="text-[13px] font-medium">{formatBaht(s.total)}</span>
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
        <div className="h-[38px] rounded-[14px] bg-fill" />
        <div className="-mt-1.5 h-[38px] rounded-[14px] bg-fill" />
        <div className="-mt-1.5 h-[38px] rounded-[14px] bg-fill" />
        <div className="-mt-2 h-[118px] rounded-pocket bg-fill" />
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

function HeroAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof IconBolt
  label: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex-1 rounded-[12px] border border-white/[0.22] px-1 py-2.5 text-center disabled:opacity-90"
    >
      <Icon size={19} className="mx-auto text-white" />
      <p className="mt-1.5 text-[11px] text-white">{label}</p>
    </button>
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
