import { useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  IconChevronRight,
  IconClipboardList,
  IconClock,
  IconHanger,
  IconLayoutList,
  IconPackageImport,
  IconSearch,
  IconShirt,
  IconShoe,
  IconX,
} from '@tabler/icons-react'
import { computeStockHero, useStockItems } from '@/hooks/useStock'
import { useStockSalesSummary } from '@/hooks/useStockSales'
import { StockEditSheet } from '@/components/StockEditSheet'
import { formatBaht } from '@/lib/format'
import { loadStockView, saveStockView, type StockView } from '@/lib/prefs'
import { daysSince } from '@/lib/dates'
import type { StockItem } from '@/lib/db'

// ── stock-age thresholds — the single source of truth (spec §อายุสต็อก) ───────
// Tune here and here only: ≤30 days = fresh (grey spine, no flag), 31–60 =
// aging (amber, "ค้าง N วัน"), >60 = old (red, "ค้าง N วัน"). These are an
// educated guess for second-hand clothing, not measured from real turnover —
// if stock usually clears in ~2 weeks, drop them.
export const AGE_FRESH_MAX = 30
export const AGE_OLD_MAX = 60

export type AgeTier = 'fresh' | 'aging' | 'old'

/** Bucket a stock age (in days) into its visual/flag tier. */
export function ageTier(days: number): AgeTier {
  if (days <= AGE_FRESH_MAX) return 'fresh'
  if (days <= AGE_OLD_MAX) return 'aging'
  return 'old'
}

// ── filters ──────────────────────────────────────────────────────────────────

export type StockFilter = 'all' | 'in_stock' | 'stale' | 'needs_details' | 'sold'

export const FILTERS: { key: StockFilter; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'in_stock', label: 'ในสต็อก' },
  { key: 'stale', label: 'ค้างนาน' },
  { key: 'needs_details', label: 'รอเติมข้อมูล' },
  { key: 'sold', label: 'ขายแล้ว' },
]

export type StockCounts = Record<StockFilter, number>

/** True when an item is still on the rack (any non-sold status). */
function inStock(it: Pick<StockItem, 'status'>): boolean {
  return it.status !== 'sold'
}

/** "ค้างนาน" — in stock and older than the aging cap (spec: in-stock & >60 days).
 *  Exported: the header bell's attention counter reuses this exact predicate
 *  against a narrower row shape than the full Stock page query. */
export function isStale(it: Pick<StockItem, 'status' | 'created_at'>, now: Date): boolean {
  return inStock(it) && daysSince(it.created_at, now) > AGE_OLD_MAX
}

/**
 * Per-chip counts over **all** items (never the already-filtered list) — the
 * badge on each chip is a running total, not "how many the current filter left".
 */
export function computeCounts(items: StockItem[], now: Date = new Date()): StockCounts {
  const counts: StockCounts = { all: 0, in_stock: 0, stale: 0, needs_details: 0, sold: 0 }
  for (const it of items) {
    counts.all++
    if (inStock(it)) {
      counts.in_stock++
      if (isStale(it, now)) counts.stale++
    } else {
      counts.sold++
    }
    if (it.needs_details) counts.needs_details++
  }
  return counts
}

function matchesFilter(it: StockItem, filter: StockFilter, now: Date): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'in_stock':
      return inStock(it)
    case 'sold':
      return !inStock(it)
    case 'needs_details':
      return it.needs_details
    case 'stale':
      return isStale(it, now)
  }
}

/** Search haystack — name · brand · category · SKU · size · color (spec §ค้นหา). */
function matchesSearch(it: StockItem, q: string): boolean {
  const hay = `${it.name} ${it.brand ?? ''} ${it.category ?? ''} ${it.sku ?? ''} ${
    it.size ?? ''
  } ${it.color ?? ''}`.toLowerCase()
  return hay.includes(q)
}

/**
 * The visible list: filter chip + free-text search combined. Items arrive
 * newest-first from the query and stay that way — EXCEPT under "ค้างนาน", which
 * re-sorts oldest-first so the most-stuck pieces surface at the top (spec).
 */
export function selectStockItems(
  items: StockItem[],
  filter: StockFilter,
  query: string,
  now: Date = new Date(),
): StockItem[] {
  const q = query.trim().toLowerCase()
  const out = items.filter(
    (it) => matchesFilter(it, filter, now) && (q === '' || matchesSearch(it, q)),
  )
  if (filter === 'stale') {
    return [...out].sort((a, b) => daysSince(b.created_at, now) - daysSince(a.created_at, now))
  }
  return out
}

/** Empty-state copy, chosen from why the list came back empty. */
export function emptyMessage(opts: {
  isLoading: boolean
  total: number
  query: string
  filter: StockFilter
}): string {
  const { isLoading, total, query, filter } = opts
  if (isLoading) return 'กำลังโหลด…'
  const q = query.trim()
  if (q) return `ไม่พบ "${q}" — ลองค้นด้วยรหัส SKU ดูไหม`
  if (total === 0) return 'ยังไม่มีสินค้าในคลัง — แตะปุ่มรับเข้าสต็อกด้านบน'
  switch (filter) {
    case 'in_stock':
      return 'ขายหมดทุกชิ้นแล้ว 🎉'
    case 'stale':
      return 'ไม่มีของค้างนาน — เคลียร์สต็อกได้ดีมาก'
    case 'needs_details':
      return 'ไม่มีรายการที่รอเติมข้อมูล'
    case 'sold':
      return 'ยังไม่มีรายการที่ขายแล้ว'
    default:
      return 'ไม่มีรายการ'
  }
}

// ── silhouettes ──────────────────────────────────────────────────────────────

/** Category-guessed clothing silhouette for items with no photo (decoration). */
function thumbIcon(it: StockItem) {
  const hay = `${it.category ?? ''} ${it.name}`
  if (/รองเท้า|shoe|sneaker/i.test(hay)) return IconShoe
  if (/ฮู้ด|hood|กางเกง|pant|jacket|เสื้อคลุม/i.test(hay)) return IconHanger
  return IconShirt
}

// ── small shared bits ────────────────────────────────────────────────────────

function statusLabel(it: StockItem): string {
  return inStock(it) ? `ในสต็อก เหลือ ${it.qty_remaining} ชิ้น` : 'ขายแล้ว'
}

function ariaLabel(it: StockItem): string {
  return `${it.name} · SKU ${it.sku} · ${statusLabel(it)}`
}

function profitPerUnit(it: StockItem): number | null {
  return it.target_price != null ? Number(it.target_price) - Number(it.cost_per_unit) : null
}

/** Age-tier accents. `spine` colours the list scan-rail; `pinText` the age pin. */
const AGE_ACCENT: Record<AgeTier, { spine: string; pinText: string }> = {
  fresh: { spine: 'bg-chevron', pinText: 'text-muted' },
  aging: { spine: 'bg-warn', pinText: 'text-warn' },
  old: { spine: 'bg-expense', pinText: 'text-expense' },
}

/** Woven SKU label — same fabric/thread as the STOCK hero (spec §ป้ายทอ SKU). */
export function SkuTag({ sku, className = '' }: { sku: string; className?: string }) {
  return (
    <span
      className={`woven inline-flex items-center rounded-[4px] bg-brand-fabric-stock px-1.5 py-[2px] text-[9.5px] font-medium tabular-nums tracking-wide text-brand-thread ${className}`}
    >
      {sku}
    </span>
  )
}

/** A meaning-bearing flag: always icon **and** text, never colour alone (spec). */
function Flag({
  icon: Icon,
  children,
  tone,
}: {
  icon: typeof IconClock
  children: ReactNode
  tone: 'age' | 'warn'
}) {
  const cls =
    tone === 'warn'
      ? 'bg-warn-bg text-warn-ink'
      : 'bg-fill text-muted'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[6px] px-1.5 py-[2px] text-[10.5px] font-medium ${cls}`}
    >
      <Icon size={12} aria-hidden />
      {children}
    </span>
  )
}

export function StockPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialFilter = (location.state as { filter?: StockFilter } | null)?.filter
  const [filter, setFilter] = useState<StockFilter>(
    initialFilter && FILTERS.some((f) => f.key === initialFilter) ? initialFilter : 'all',
  )
  const [search, setSearch] = useState('')
  const [view, setView] = useState<StockView>(loadStockView)
  const [editing, setEditing] = useState<StockItem | null>(null)
  const { data, isLoading } = useStockItems()
  const salesQ = useStockSalesSummary()

  const items = data?.items ?? []
  const now = useMemo(() => new Date(), [])
  const hero = useMemo(() => computeStockHero(items), [items])
  const counts = useMemo(() => computeCounts(items, now), [items, now])
  const visible = useMemo(
    () => selectStockItems(items, filter, search, now),
    [items, filter, search, now],
  )

  const piecesInStock = items.reduce((n, it) => (inStock(it) ? n + (it.qty_remaining ?? 0) : n), 0)
  const queueCount = counts.needs_details

  function chooseView(next: StockView) {
    setView(next)
    saveStockView(next)
  }

  const thumbFor = (it: StockItem) => data?.thumbs[it.photos?.[0] ?? '']

  return (
    <div className="flex min-h-full flex-col">
      {/* header — filters moved to chips (B8 removed), search made permanent (B9) */}
      <div className="flex items-center justify-between px-[18px] pb-3 pt-[18px]">
        <p className="text-[17px] font-medium">คลังสินค้า</p>
        <button aria-label="รับเข้าสต็อก" onClick={() => navigate('/stock/intake')}>
          <IconPackageImport size={20} className="text-brand-deep" />
        </button>
      </div>

      {/* permanent search field (44px) */}
      <div className="px-4 pb-3">
        <div className="flex h-11 items-center gap-2 rounded-input border-[0.5px] border-hairline bg-fill px-3">
          <IconSearch size={17} className="shrink-0 text-faint" aria-hidden />
          <input
            aria-label="ค้นหาสินค้า"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา ชื่อ · แบรนด์ · SKU · ไซซ์"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
          />
          {search && (
            <button
              aria-label="ล้างคำค้นหา"
              onClick={() => setSearch('')}
              className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center"
            >
              <IconX size={16} className="text-faint" />
            </button>
          )}
        </div>
      </div>

      {/* woven value hero — same fabric as the home STOCK PROFIT label */}
      <div className="mx-4 mb-3.5">
        <div
          className="woven relative overflow-hidden rounded-card bg-brand-fabric-stock text-brand-thread shadow-card"
          style={{ height: 112 }}
        >
          <span aria-hidden className="selvedge absolute inset-x-0 top-0 h-[6px]" />
          <span aria-hidden className="selvedge absolute inset-x-0 bottom-0 h-[6px]" />
          <div className="relative flex h-full items-stretch justify-between px-[18px] py-3.5">
            <div className="flex flex-col justify-center">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] opacity-80">
                STOCK VALUE
              </p>
              <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums">
                {formatBaht(hero.costValue)}
              </p>
              <p className="mt-1.5 text-[11px] opacity-80">
                {piecesInStock} ชิ้นในคลัง · ต้นทุนรวม
              </p>
            </div>
            <div className="flex flex-col items-end justify-center text-right">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] opacity-80">
                รอขาย
              </p>
              <p className="mt-1 text-[17px] font-semibold tabular-nums">
                +{formatBaht(hero.pendingProfit)}
              </p>
              <p className="mt-1.5 text-[11px] opacity-80">ถ้าขายได้ตามราคาตั้ง</p>
            </div>
          </div>
        </div>
      </div>

      {/* realised sales this month (unchanged, kept below the hero) */}
      {(salesQ.data?.sale_count ?? 0) > 0 && (
        <div className="mx-4 mb-3.5 flex items-center justify-between rounded-card border-[0.5px] border-hairline px-4 py-3">
          <div>
            <p className="text-[11px] text-muted">ขายเดือนนี้</p>
            <p className="mt-[2px] text-[16px] font-medium">
              {formatBaht(salesQ.data!.revenue)}
              <span className="ml-1.5 text-[11px] text-faint">{salesQ.data!.qty_sold} ชิ้น</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted">กำไรที่รับรู้แล้ว</p>
            <p
              className={`mt-[2px] text-[16px] font-medium ${
                salesQ.data!.profit >= 0 ? 'text-brand-deep' : 'text-expense'
              }`}
            >
              {salesQ.data!.profit >= 0 ? '+' : '-'}
              {formatBaht(Math.abs(salesQ.data!.profit))}
            </p>
          </div>
        </div>
      )}

      {/* queue banner (unchanged) */}
      {queueCount > 0 && (
        <button
          onClick={() => navigate('/stock/queue')}
          className="mx-4 mb-3 flex items-center gap-2.5 rounded-[12px] bg-warn-bg px-3.5 py-2.5 text-left"
        >
          <IconClipboardList size={18} className="shrink-0 text-warn-ink" />
          <span className="flex-1 text-[12px] font-medium text-warn-ink">
            {queueCount} ชิ้นรอเติมรายละเอียด
          </span>
          <IconChevronRight size={16} className="shrink-0 text-warn-ink" />
        </button>
      )}

      {items.length > 0 && (
        <>
          {/* filter chips — one scrolling row, each with a count over all items */}
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4">
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
                    className={`flex h-8 items-center gap-1.5 rounded-pill px-3.5 text-[12px] ${
                      active
                        ? 'bg-brand-tint font-medium text-brand-ink'
                        : 'border-[0.5px] border-hairline text-muted'
                    }`}
                  >
                    {f.label}
                    <span
                      className={`tabular-nums ${active ? 'text-brand-ink/70' : 'text-faint'}`}
                    >
                      {counts[f.key]}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* result count + view toggle */}
          <div className="flex items-center justify-between px-4 pb-1 pt-0.5">
            <p className="text-[11px] text-faint">{visible.length} ชิ้น</p>
            <div
              role="group"
              aria-label="สลับมุมมอง"
              className="flex items-center gap-0.5 rounded-pill bg-fill p-0.5"
            >
              <ViewButton
                active={view === 'rack'}
                label="ราว"
                ariaLabel="มุมมองราว"
                icon={IconHanger}
                onClick={() => chooseView('rack')}
              />
              <ViewButton
                active={view === 'list'}
                label="รายการ"
                ariaLabel="มุมมองรายการ"
                icon={IconLayoutList}
                onClick={() => chooseView('list')}
              />
            </div>
          </div>
        </>
      )}

      {/* content */}
      <div className="flex-1 px-4 pb-4">
        {visible.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-faint">
            {emptyMessage({ isLoading, total: items.length, query: search, filter })}
          </p>
        ) : view === 'rack' ? (
          <RackGrid items={visible} thumbFor={thumbFor} now={now} onOpen={setEditing} />
        ) : (
          <div className="pt-1">
            {visible.map((it) => (
              <StockRow
                key={it.id}
                item={it}
                thumb={thumbFor(it)}
                now={now}
                onOpen={() => setEditing(it)}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <StockEditSheet
          item={editing}
          hasSales={(data?.salesCount?.[editing.id] ?? 0) > 0}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

// ── view toggle button ───────────────────────────────────────────────────────

function ViewButton({
  active,
  label,
  ariaLabel,
  icon: Icon,
  onClick,
}: {
  active: boolean
  label: string
  ariaLabel: string
  icon: typeof IconHanger
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={`flex min-h-[36px] items-center gap-1 rounded-pill px-3 text-[12px] ${
        active ? 'bg-white font-medium text-ink shadow-card' : 'text-muted'
      }`}
    >
      <Icon size={15} aria-hidden />
      {label}
    </button>
  )
}

// ── rack view ────────────────────────────────────────────────────────────────

/** Hanger line-drawing that straddles the steel rail above each item. */
function Hanger() {
  return (
    <svg
      aria-hidden
      width="44"
      height="24"
      viewBox="0 0 44 24"
      className="text-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="22" cy="4" r="2.4" />
      <path d="M22 6.4V10" />
      <path d="M5 21 L22 10 L39 21" />
    </svg>
  )
}

function RackGrid({
  items,
  thumbFor,
  now,
  onOpen,
}: {
  items: StockItem[]
  thumbFor: (it: StockItem) => string | undefined
  now: Date
  onOpen: (it: StockItem) => void
}) {
  // Chunk into pairs — each pair sits under its own steel rail.
  const rows: StockItem[][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))

  return (
    <div className="pt-2">
      {rows.map((pair, ri) => (
        <div key={ri} className="mb-2">
          <div aria-hidden className="rack-rail h-1 rounded-full" />
          <div className="grid grid-cols-2 gap-x-3">
            {pair.map((it) => (
              <RackCell
                key={it.id}
                item={it}
                thumb={thumbFor(it)}
                now={now}
                onOpen={() => onOpen(it)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RackCell({
  item,
  thumb,
  now,
  onOpen,
}: {
  item: StockItem
  thumb?: string
  now: Date
  onOpen: () => void
}) {
  const sold = !inStock(item)
  const Icon = thumbIcon(item)
  const days = daysSince(item.created_at, now)
  const tier = ageTier(days)
  const meta = [item.brand, item.size].filter(Boolean).join(' · ')

  return (
    <div className="relative flex flex-col pt-[15px]">
      {/* hanger straddling the rail above the cell */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[13px]"
      >
        <Hanger />
      </div>

      <button onClick={onOpen} aria-label={ariaLabel(item)} className="text-left">
        <div className="relative aspect-square w-full overflow-hidden rounded-[12px] bg-fill">
          {thumb ? (
            <img
              src={thumb}
              alt=""
              className={`h-full w-full object-cover ${sold ? 'opacity-45' : ''}`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon size={40} className={sold ? 'text-faint/60' : 'text-brand-deep/70'} aria-hidden />
            </div>
          )}

          {/* woven SKU label, top-left */}
          <SkuTag sku={item.sku} className="absolute left-1.5 top-1.5" />

          {/* age pin, top-right — not shown once sold */}
          {!sold && (
            <span
              className={`absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-white/90 px-1.5 py-[2px] text-[10px] font-medium tabular-nums ${AGE_ACCENT[tier].pinText}`}
            >
              <IconClock size={11} aria-hidden />
              {days} วัน
            </span>
          )}

          {/* sold band across the bottom edge */}
          {sold && (
            <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-1 text-center text-[10px] font-medium text-white">
              ขายแล้ว
            </span>
          )}
        </div>

        <p className={`mt-2 truncate text-[13px] font-medium ${sold ? 'text-muted' : ''}`}>
          {item.name}
        </p>
        {meta && <p className="mt-0.5 truncate text-[11px] text-faint">{meta}</p>}
        <p className="mt-0.5 text-[11px] text-muted">
          {formatBaht(item.cost_per_unit)}
          {' → '}
          {item.target_price != null ? (
            <span className="text-ink">{formatBaht(item.target_price)}</span>
          ) : (
            <span className="font-medium text-warn">ตั้งราคา</span>
          )}
        </p>
      </button>
    </div>
  )
}

// ── list view ────────────────────────────────────────────────────────────────

function StockRow({
  item,
  thumb,
  now,
  onOpen,
}: {
  item: StockItem
  thumb?: string
  now: Date
  onOpen: () => void
}) {
  const sold = !inStock(item)
  const Icon = thumbIcon(item)
  const days = daysSince(item.created_at, now)
  const tier = ageTier(days)
  const meta = [item.brand, item.size, item.color].filter(Boolean).join(' · ')
  const profitPer = profitPerUnit(item)
  // Sold rows carry no age meaning → neutral spine; live rows tint by tier.
  const spine = sold ? 'bg-hairline' : AGE_ACCENT[tier].spine

  return (
    <button
      onClick={onOpen}
      aria-label={ariaLabel(item)}
      className="flex w-full items-stretch gap-3 border-b-[0.5px] border-hairline py-3 text-left last:border-b-0"
    >
      {/* age spine — a scan aid only, never the sole signal */}
      <span aria-hidden className={`w-[3px] shrink-0 self-stretch rounded-full ${spine}`} />

      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[11px] ${
          sold ? 'bg-fill opacity-70' : thumb ? 'bg-fill' : 'bg-brand-tint'
        }`}
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon size={22} className={sold ? 'text-faint' : 'text-brand-deep'} aria-hidden />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-[13.5px] font-medium ${sold ? 'text-muted' : ''}`}>
          {item.name}
        </p>
        {meta && <p className="mt-0.5 truncate text-[11px] text-faint">{meta}</p>}
        <p className="mt-[3px] text-[11px] text-muted">
          {formatBaht(item.cost_per_unit)}
          {' → '}
          {item.target_price != null ? (
            <span className="text-ink">{formatBaht(item.target_price)}</span>
          ) : (
            <span className="font-medium text-warn">ตั้งราคา</span>
          )}
        </p>

        {/* flags — every one carries an icon AND text, never colour alone */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <SkuTag sku={item.sku} />
          {!sold && tier !== 'fresh' && (
            <Flag icon={IconClock} tone={tier === 'old' ? 'warn' : 'age'}>
              ค้าง {days} วัน
            </Flag>
          )}
          {item.needs_details && (
            <Flag icon={IconClipboardList} tone="warn">
              รอเติมข้อมูล
            </Flag>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        {sold ? (
          <span className="rounded-pill bg-fill px-[9px] py-[3px] text-[11px] font-medium text-muted">
            ขายแล้ว
          </span>
        ) : (
          <span className="rounded-pill bg-brand-tint px-[9px] py-[3px] text-[11px] font-medium text-brand-ink">
            เหลือ {item.qty_remaining}
          </span>
        )}
        {profitPer != null && !sold && (
          <p className="mt-1.5 text-[12px] text-brand-deep">+{formatBaht(profitPer)}/ชิ้น</p>
        )}
      </div>
    </button>
  )
}
