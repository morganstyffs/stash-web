import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconBell, IconClock } from '@tabler/icons-react'
import { useCategories } from '@/hooks/useLookups'
import { useAttentionSignals } from '@/hooks/useAttention'
import { useDialogA11y } from '@/lib/useDialogA11y'
import type { StockFilter } from '@/pages/StockPage'
import {
  computeHomeSummary,
  useMonthTransactions,
  useRecentTransactions,
  type DonutSlice,
  type RecentRow,
} from '@/hooks/useHome'
import { useUpcomingBills, type PendingItem } from '@/hooks/useUpcomingBills'
import { Donut } from '@/components/charts'
import { WovenHero } from '@/components/WovenHero'
import { useMonthBudgetTotal } from '@/hooks/useBudgets'
import { useStockSalesSummary } from '@/hooks/useStockSales'
import { useDelayedFlag } from '@/hooks/useDelayedFlag'
import { useHomeMoments } from '@/hooks/useHomeMoments'
import { TransactionEditSheet } from '@/components/TransactionEditSheet'
import { LedgerRow } from '@/components/LedgerRow'
import { useToast } from '@/components/Toast'
import { categoryIcon } from '@/lib/icons'
import { catColorVar } from '@/lib/catColor'
import { formatRecentDayLabel, formatUpcomingDayLabel, monthKey } from '@/lib/dates'
import { largestRemainderPercents } from '@/lib/percent'
import { translateError } from '@/lib/errors'
import { loadHideBalance, saveHideBalance } from '@/lib/prefs'
import { formatBaht, formatSigned, MASKED_BAHT } from '@/lib/format'

interface LegendRow {
  key: string
  name: string
  /** category colour slot 1–6, or null for the neutral "อื่นๆ" roll-up swatch */
  colorIndex: number | null
  total: number
  /** share of the ring total, rounded to a whole percent */
  pct: number
}

/**
 * Legend rows for the category donut: the top 3 categories, plus — when there
 * are more — a 4th "อื่นๆ (N หมวด)" row carrying the summed remainder, so the
 * legend's baht add up to the number in the middle of the ring (the donut draws
 * every slice; only this legend was truncating). Percentages are of the ring
 * total; the roll-up row uses a neutral swatch rather than a category colour.
 */
function buildDonutLegend(slices: DonutSlice[]): LegendRow[] {
  const base = slices.slice(0, 3).map((s) => ({
    key: s.categoryId,
    name: s.name,
    colorIndex: s.colorIndex,
    total: s.total,
  }))
  const rest = slices.slice(3)
  if (rest.length > 0) {
    base.push({
      key: '__other__',
      name: `อื่นๆ (${rest.length} หมวด)`,
      colorIndex: null,
      total: rest.reduce((s, x) => s + x.total, 0),
    })
  }
  // These rows cover the whole ring total (the "อื่นๆ" roll-up carries every
  // slice past the top 3), so largest-remainder percents make the shown numbers
  // sum to exactly 100 instead of drifting to 99 with independent Math.round.
  const pcts = largestRemainderPercents(base.map((r) => r.total))
  return base.map((r, i) => ({ ...r, pct: pcts[i] }))
}

export function HomePage() {
  const monthQ = useMonthTransactions()
  const catsQ = useCategories()
  const recentQ = useRecentTransactions()
  const upcomingQ = useUpcomingBills()
  const budgetTotalQ = useMonthBudgetTotal()
  const stockQ = useStockSalesSummary()
  const navigate = useNavigate()
  const attention = useAttentionSignals()
  const toast = useToast()
  const [panelOpen, setPanelOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [hideBalance, setHideBalance] = useState(loadHideBalance)
  // Which ledger tab is showing. Always starts on "recent" — not remembered across
  // visits (no prefs entry), per spec.
  const [tab, setTab] = useState<'recent' | 'pending'>('recent')

  // The upcoming-bills query can throw (a rule whose schedule won't advance, or a
  // dead RPC) — surface it, never swallow (rule 6). The sub-line/tab then fall back
  // to "no bills" rather than a wrong figure.
  useEffect(() => {
    if (upcomingQ.error) toast.error(`รายการรอจ่ายไม่ทำงาน: ${translateError(upcomingQ.error)}`)
  }, [upcomingQ.error, toast])

  function toggleHideBalance() {
    setHideBalance((v) => {
      const next = !v
      saveHideBalance(next)
      return next
    })
  }

  const summary = useMemo(
    () => computeHomeSummary(monthQ.data ?? [], catsQ.data ?? []),
    [monthQ.data, catsQ.data],
  )

  const loading = monthQ.isLoading || catsQ.isLoading
  // Skeleton only after a beat: a cached load resolves first, so no flash.
  const showSkeleton = useDelayedFlag(loading, 200)

  // One-off "moment" animations, decided once everything the hero reads is in.
  const ready =
    !monthQ.isLoading && !catsQ.isLoading && !stockQ.isLoading && !recentQ.isLoading
  const stockActive = (stockQ.data?.qty_sold ?? 0) > 0
  const { newMonth, firstSale } = useHomeMoments(ready, monthKey(), stockActive)

  // Brand-new user: no transactions logged anywhere, no sales → invite, don't
  // show ฿0 and empty lists.
  const isNewUser =
    ready &&
    (recentQ.data?.length ?? 0) === 0 &&
    (monthQ.data?.length ?? 0) === 0 &&
    !stockActive

  if (loading) return showSkeleton ? <HomeSkeleton /> : null

  return (
    <div className="flex min-h-full flex-col">
      {/* header */}
      <div className="flex items-center justify-between px-[18px] pb-2.5 pt-[18px]">
        <Link to="/" aria-label="Stash">
          <img src="/stash-mark.svg" alt="Stash" className="h-[30px] w-[30px]" />
        </Link>
        <p className="text-[17px] font-medium">ยินดีต้อนรับกลับ</p>
        <div className="relative">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            aria-label={
              attention.data && attention.data.total > 0
                ? `เรื่องที่รอดู ${attention.data.total} รายการ`
                : 'เรื่องที่รอดู — ไม่มีตอนนี้'
            }
            aria-expanded={panelOpen}
            className="relative"
          >
            <IconBell size={20} className="text-muted" />
            {!!attention.data?.total && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-fabric-stock px-1 text-[9px] font-medium text-brand-thread">
                {attention.data.total > 9 ? '9+' : attention.data.total}
              </span>
            )}
          </button>
          {panelOpen && (
            <AttentionPanel
              needsDetails={attention.data?.needsDetails ?? 0}
              stale={attention.data?.stale ?? 0}
              onNavigate={(path, filter) => {
                setPanelOpen(false)
                navigate(path, filter ? { state: { filter } } : undefined)
              }}
              onClose={() => setPanelOpen(false)}
            />
          )}
        </div>
      </div>

      {/* woven-label hero */}
      <div className="px-4 pb-1 pt-1.5">
        <WovenHero
          safeToSpend={summary.safeToSpend}
          daysLeft={summary.daysLeft}
          upcomingBills={upcomingQ.data?.total ?? 0}
          deltaPct={summary.deltaPct}
          budgetTotal={budgetTotalQ.data ?? 0}
          budgetSpending={summary.budgetSpending}
          stock={stockQ.data ?? { revenue: 0, cogs: 0, profit: 0, sale_count: 0, qty_sold: 0 }}
          hideBalance={hideBalance}
          onToggleHide={toggleHideBalance}
          empty={isNewUser}
          newMonth={newMonth}
          firstSale={firstSale}
        />
      </div>

      {/* category donut */}
      {!isNewUser && (
      <div className="mx-4 mt-3.5 border-t-[0.5px] border-hairline pt-3.5">
        <p className="mb-3 text-[15px] font-medium">หมวดใช้จ่าย</p>
        {summary.donut.length > 0 ? (
          <div className="flex items-center gap-[18px]">
            <Donut slices={summary.donut} hideBalance={hideBalance} />
            <div className="min-w-0 flex-1">
              {buildDonutLegend(summary.donut).map((row) => (
                <div
                  key={row.key}
                  className="mb-[9px] flex items-center justify-between gap-2 last:mb-0"
                >
                  <span className="flex min-w-0 items-center text-[12.5px]">
                    <span
                      className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: catColorVar(row.colorIndex) }}
                    />
                    <span className="truncate">{row.name}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-1.5">
                    {/* mask the baht with the hero's hide-balance toggle so the
                        amounts don't leak here; name + % stay (% isn't a figure) */}
                    <span className="text-[12.5px] font-medium">
                      {hideBalance ? MASKED_BAHT : formatBaht(row.total)}
                    </span>
                    <span className="text-[10.5px] text-faint">{row.pct}%</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="py-3 text-[13px] text-faint">ยังไม่มีรายจ่ายเดือนนี้</p>
        )}
      </div>
      )}

      {/* ledger — recent transactions and upcoming bills as two tabs. The "รอจ่าย"
          tab exists only when there are active recurring expense rules; with none,
          this is just the plain recent list (no lone empty tab). */}
      {!isNewUser && (
        <div className="mx-4 mb-4 mt-3.5 border-t-[0.5px] border-hairline pt-3.5">
          {upcomingQ.data?.hasRules ? (
            <div role="tablist" aria-label="รายการ" className="mb-1.5 flex gap-4">
              <LedgerTab active={tab === 'recent'} onSelect={() => setTab('recent')}>
                ล่าสุด
              </LedgerTab>
              <LedgerTab active={tab === 'pending'} onSelect={() => setTab('pending')}>
                รอจ่าย
              </LedgerTab>
            </div>
          ) : (
            <p className="mb-1 text-[15px] font-medium">รายการล่าสุด</p>
          )}

          {upcomingQ.data?.hasRules && tab === 'pending' ? (
            <PendingList items={upcomingQ.data.items} hideBalance={hideBalance} />
          ) : (
            <RecentList rows={recentQ.data ?? []} onOpen={setEditingId} />
          )}
        </div>
      )}

      {editingId && (
        <TransactionEditSheet id={editingId} onClose={() => setEditingId(null)} />
      )}
    </div>
  )
}

function AttentionPanel({
  needsDetails,
  stale,
  onNavigate,
  onClose,
}: {
  needsDetails: number
  stale: number
  onNavigate: (path: string, filter?: StockFilter) => void
  onClose: () => void
}) {
  const panelRef = useDialogA11y(onClose)
  const empty = needsDetails === 0 && stale === 0
  return (
    <>
      {/* transparent click-outside catcher — this is a light anchored dropdown,
          not a full modal takeover, so no dark scrim like the bottom sheets */}
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="เรื่องที่รอดู"
        className="absolute right-0 top-[calc(100%+8px)] z-40 w-[250px] rounded-card border-[0.5px] border-hairline bg-white p-1.5 shadow-card"
      >
        {empty ? (
          <p className="px-3 py-4 text-center text-[12px] text-faint">ไม่มีเรื่องรอดูตอนนี้</p>
        ) : (
          <>
            {needsDetails > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('/stock/queue')}
                className="flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left active:bg-fill"
              >
                <span className="text-[13px]">รอเติมข้อมูล</span>
                <span className="rounded-pill bg-warn-bg px-2 py-0.5 text-[11px] font-medium text-warn-ink">
                  {needsDetails}
                </span>
              </button>
            )}
            {stale > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('/stock', 'stale')}
                className="flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left active:bg-fill"
              >
                <span className="text-[13px]">ค้างนาน</span>
                <span className="rounded-pill bg-fill px-2 py-0.5 text-[11px] font-medium text-muted">
                  {stale}
                </span>
              </button>
            )}
          </>
        )}
      </div>
    </>
  )
}

/**
 * Loading placeholder that mirrors the home layout (no ฿0 flash on first load).
 * The hero is a label caught mid-weave — fabric filling the top, the rest still
 * bare — rather than a generic pulsing block: it reads as "this is a woven label
 * loading", not "something is broken". Static by design (it only appears after a
 * 200ms delay, so a slow load lands on a calm frame, not a strobe).
 */
function HomeSkeleton() {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between px-[18px] pb-2.5 pt-[18px]">
        <div className="h-[30px] w-[30px] rounded-[9px] bg-fill" />
        <div className="h-4 w-32 rounded bg-fill" />
        <div className="h-5 w-5 rounded bg-fill" />
      </div>
      <div className="px-4 pb-1 pt-1.5">
        <div className="relative h-[254px] overflow-hidden rounded-pocket bg-fill">
          {/* the label, woven only partway down */}
          <div className="woven bg-brand-fabric absolute inset-x-0 top-0 h-[104px] opacity-80">
            <span aria-hidden className="selvedge absolute inset-x-0 top-0 h-[7px]" />
          </div>
        </div>
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

/** One tab in the ledger header (ล่าสุด / รอจ่าย). */
function LedgerTab({
  active,
  onSelect,
  children,
}: {
  active: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`pb-1 text-[15px] font-medium ${
        active ? 'border-b-2 border-brand text-ink' : 'text-faint'
      }`}
    >
      {children}
    </button>
  )
}

/** The "ล่าสุด" tab: recent transactions, grouped by day. */
function RecentList({ rows, onOpen }: { rows: RecentRow[]; onOpen: (id: string) => void }) {
  if (rows.length === 0) {
    return <p className="py-3 text-[13px] text-faint">ยังไม่มีรายการ — แตะ “เพิ่มเร็ว” เพื่อเริ่ม</p>
  }
  return (
    <>
      {rows.map((t, i) => {
        const newDay = i === 0 || rows[i - 1].date !== t.date
        return (
          <Fragment key={t.id}>
            {newDay && (
              <p className={`mb-1 text-[11px] font-medium text-faint${i === 0 ? '' : ' mt-3'}`}>
                {formatRecentDayLabel(t.date)}
              </p>
            )}
            <RecentItem tx={t} onOpen={() => onOpen(t.id)} last={i === rows.length - 1} />
          </Fragment>
        )
      })}
    </>
  )
}

function RecentItem({
  tx,
  onOpen,
  last = false,
}: {
  tx: RecentRow
  onOpen: () => void
  last?: boolean
}) {
  const time = new Date(tx.created_at).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
  // Header is the note when present, else the category name. Only repeat the
  // category on the sub-line when it genuinely differs from that header, so an
  // un-noted row doesn't print its category name twice.
  const headerText = tx.note || tx.category?.name || 'รายการ'
  const catName = tx.category?.name
  const showCat = !!catName && catName !== headerText
  return (
    <LedgerRow
      icon={categoryIcon(tx.category?.icon)}
      iconColor={catColorVar(tx.category?.color_index)}
      title={headerText}
      subtitle={showCat ? `${catName} · ${time}` : time}
      right={
        <span
          className={`shrink-0 text-[13px] font-medium ${
            tx.type === 'income' ? 'text-income' : 'text-expense'
          }`}
        >
          {formatSigned(tx.amount, tx.type)}
        </span>
      }
      onClick={onOpen}
      last={last}
    />
  )
}

/** The "รอจ่าย" tab: recurring expense charges still to hit this month, nearest
 *  first. Same row as ล่าสุด, but dimmed with a "รอตัด · <date>" cue so it reads
 *  as not-yet-happened without relying on colour. */
function PendingList({ items, hideBalance }: { items: PendingItem[]; hideBalance: boolean }) {
  if (items.length === 0) {
    return <p className="py-3 text-[13px] text-faint">ไม่เหลือรายการรอจ่ายในเดือนนี้</p>
  }
  return (
    <>
      {items.map((item, i) => (
        <PendingRow
          key={item.key}
          item={item}
          hideBalance={hideBalance}
          last={i === items.length - 1}
        />
      ))}
    </>
  )
}

function PendingRow({
  item,
  hideBalance,
  last,
}: {
  item: PendingItem
  hideBalance: boolean
  last: boolean
}) {
  return (
    <LedgerRow
      icon={categoryIcon(item.icon)}
      iconColor={catColorVar(item.colorIndex)}
      title={item.label}
      subtitle={
        <span className="inline-flex items-center gap-1">
          <IconClock size={11} className="shrink-0" aria-hidden />
          รอตัด · {formatUpcomingDayLabel(item.date)}
        </span>
      }
      right={
        <span className="shrink-0 text-[13px] font-medium text-muted">
          {hideBalance ? MASKED_BAHT : formatSigned(item.amount, 'expense')}
        </span>
      }
      last={last}
      muted
    />
  )
}
