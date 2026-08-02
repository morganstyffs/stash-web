import { useMemo, useState, type ReactNode } from 'react'
import { IconAlertTriangle, IconChevronDown } from '@tabler/icons-react'
import { useStockSalesRange, type SalesSummary } from '@/hooks/useStockSales'
import { useShopOperatingSummary, type ShopOperating } from '@/hooks/useShopOperating'
import { computeShopProfit } from '@/lib/shopAccount'
import { formatBaht, MASKED_BAHT } from '@/lib/format'
import { monthBoundsFromKey, monthKey, trailingMonthsBounds } from '@/lib/dates'
import { SegmentedControl } from '@/components/SegmentedControl'

// ── period ───────────────────────────────────────────────────────────────────

export type ShopPeriod = 'month' | 'trailing3'

const PERIOD_OPTIONS: { value: ShopPeriod; label: string }[] = [
  { value: 'month', label: 'เดือนนี้' },
  { value: 'trailing3', label: '3 เดือน' },
]

/** The [from, to) window for a period, anchored on `now`'s Bangkok month. */
export function periodRange(period: ShopPeriod, now: Date): { from: string; to: string } {
  const key = monthKey(now)
  if (period === 'trailing3') {
    const t = trailingMonthsBounds(key, 3)
    return { from: t.from, to: t.to }
  }
  const b = monthBoundsFromKey(key)
  return { from: b.start, to: b.next }
}

// The mandatory on-card note (§4.5): net profit is recomputed under the current
// rules every time, so re-tagging a category moves past months too — unlike gross
// profit, which is snapshotted at sale time.
export const REVALUATION_NOTE =
  'ตัวเลขคิดด้วยกติกาปัจจุบันเสมอ — ถ้าเปลี่ยนป้าย “ร้าน” ของหมวดไหน ตัวเลขของเดือนก่อน ๆ จะขยับตาม'

// ── presentational view (exported for tests) ─────────────────────────────────

/** money helper: masked placeholder while hide-balance is on, else the figure. */
function money(v: number, hide: boolean): string {
  return hide ? MASKED_BAHT : formatBaht(v)
}
/** signed total (gross / net) — hidden as a bare mask so the sign can't leak the
 *  profit/loss direction while scanning; shown with a unicode minus otherwise. */
function signedMoney(v: number, hide: boolean): string {
  if (hide) return MASKED_BAHT
  return v < 0 ? `−${formatBaht(-v)}` : formatBaht(v)
}

function Row({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string
  value: ReactNode
  strong?: boolean
  tone?: 'muted'
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`text-[13px] ${tone === 'muted' ? 'text-muted' : ''}`}>{label}</span>
      <span className={`tabular-nums ${strong ? 'text-[15px] font-medium' : 'text-[13px]'}`}>
        {value}
      </span>
    </div>
  )
}

const PENDING = '…'

export function ShopProfitCardView({
  period,
  onPeriodChange,
  sales,
  shop,
  hideBalance,
}: {
  period: ShopPeriod
  onPeriodChange: (p: ShopPeriod) => void
  /** undefined while the sales query is in flight (renders per-line placeholders). */
  sales: SalesSummary | undefined
  /** undefined while the shop-operating query is in flight. */
  shop: ShopOperating | undefined
  hideBalance: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const profit = useMemo(
    () =>
      sales && shop
        ? computeShopProfit({
            grossProfit: sales.profit,
            shopIncome: shop.income,
            shopExpense: shop.expense,
          })
        : undefined,
    [sales, shop],
  )

  // "Nothing happened this period" — no sale AND no shop money either way. Show an
  // invitation instead of a card full of ฿0 (convention: never a bare zero).
  const empty =
    sales != null &&
    shop != null &&
    sales.sale_count === 0 &&
    shop.income === 0 &&
    shop.expense === 0

  const netLoss = profit != null && profit.netProfit < 0

  return (
    <div className="mx-4 mb-3.5 rounded-card border-[0.5px] border-hairline px-4 py-3.5">
      <div className="mb-3">
        <SegmentedControl
          options={PERIOD_OPTIONS}
          value={period}
          onChange={onPeriodChange}
          ariaLabel="ช่วงเวลาสรุปกำไรร้าน"
        />
      </div>

      {empty ? (
        <p className="py-6 text-center text-[13px] text-faint">
          {period === 'trailing3'
            ? 'ยังไม่มีการขายหรือค่าใช้จ่ายร้านใน 3 เดือนนี้'
            : 'ยังไม่มีการขายหรือค่าใช้จ่ายร้านเดือนนี้'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Row label="ยอดขาย" value={sales ? money(sales.revenue, hideBalance) : PENDING} />
          <Row
            label="ต้นทุนที่ขายไป"
            value={sales ? `−${money(sales.cogs, hideBalance)}` : PENDING}
            tone="muted"
          />
          <div className="my-0.5 border-t-[0.5px] border-hairline" />
          <Row
            label="กำไรขั้นต้น"
            value={sales ? signedMoney(sales.profit, hideBalance) : PENDING}
          />

          {/* ค่าดำเนินร้าน — tap to split จ่ายไป / เก็บได้ (§4.4) */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex items-baseline justify-between text-left"
          >
            <span className="inline-flex items-center gap-1 text-[13px]">
              ค่าดำเนินร้าน
              <IconChevronDown
                size={13}
                className={`text-faint transition-transform ${expanded ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </span>
            <span className="text-[13px] tabular-nums">
              {profit == null
                ? PENDING
                : profit.operatingNet >= 0
                  ? `−${money(profit.operatingNet, hideBalance)}`
                  : `+${money(-profit.operatingNet, hideBalance)}`}
            </span>
          </button>
          {expanded && (
            <div className="flex flex-col gap-1 rounded-[10px] bg-fill px-3 py-2">
              <Row
                label="จ่ายไป (ค่าส่ง · แพ็ค · ฟี · การตลาด)"
                value={shop ? `−${money(shop.expense, hideBalance)}` : PENDING}
                tone="muted"
              />
              <Row
                label="เก็บได้ (ค่าส่งจากลูกค้า)"
                value={shop ? `+${money(shop.income, hideBalance)}` : PENDING}
                tone="muted"
              />
            </div>
          )}

          <div className="my-0.5 border-t-[0.5px] border-hairline" />

          {/* กำไรสุทธิ — the headline figure of the card */}
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium">กำไรสุทธิ</span>
            <span
              className={`inline-flex items-center gap-1 text-[22px] font-semibold tabular-nums ${
                netLoss ? 'text-expense' : 'text-brand-deep'
              }`}
            >
              {netLoss && !hideBalance && (
                <IconAlertTriangle size={16} aria-hidden className="shrink-0" />
              )}
              {profit ? signedMoney(profit.netProfit, hideBalance) : PENDING}
            </span>
          </div>

          {shop?.capped && (
            <p className="mt-1 inline-flex items-start gap-1 text-[11px] text-warn-ink">
              <IconAlertTriangle size={12} aria-hidden className="mt-[2px] shrink-0" />
              ค่าดำเนินร้านมีรายการมากในช่วงนี้ — ตัวเลขอาจไม่ครบ
            </p>
          )}
        </div>
      )}

      <p className="mt-3 border-t-[0.5px] border-hairline pt-2.5 text-[11px] leading-relaxed text-faint">
        {REVALUATION_NOTE}
      </p>
    </div>
  )
}

// ── container ────────────────────────────────────────────────────────────────

/**
 * Shop P&L card for the stock screen. Owns the period toggle, fetches the two
 * buckets for the chosen window (realised sales via stock_sales_summary + shop-
 * operating totals), and hands resolved figures to the view. Each query renders
 * its own lines as it lands — no all-or-nothing gate.
 */
export function ShopProfitCard({ hideBalance, now }: { hideBalance: boolean; now: Date }) {
  const [period, setPeriod] = useState<ShopPeriod>('month')
  const range = useMemo(() => periodRange(period, now), [period, now])
  const salesQ = useStockSalesRange(range.from, range.to)
  const shopQ = useShopOperatingSummary(range.from, range.to)

  return (
    <ShopProfitCardView
      period={period}
      onPeriodChange={setPeriod}
      sales={salesQ.data}
      shop={shopQ.data}
      hideBalance={hideBalance}
    />
  )
}
