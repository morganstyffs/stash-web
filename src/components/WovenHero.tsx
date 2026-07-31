import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconAlertTriangle,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconTrendingDown,
  IconTrendingUp,
} from '@tabler/icons-react'
import { formatBaht, MASKED_BAHT } from '@/lib/format'
import { computeSpendable, type SpendableView } from '@/lib/spendable'
import type { SalesSummary } from '@/hooks/useStockSales'

/**
 * Home hero — three woven clothing labels sewn at one seam, folded up over each
 * other. The front label is the one the user picked (SAFE by default) and shows
 * its full headline; the folded ones behind still show a header strip with their
 * eyebrow + a compact figure, so information is revealed, not hidden. Tapping a
 * folded label brings it to the front.
 *
 * Every figure arrives pre-computed via props — this component derives nothing
 * about money beyond choosing which sentence/word to show for each edge case
 * (the pure helpers below, unit-tested in WovenHero.test.ts).
 */

export type HeroKey = 'safe' | 'budget' | 'stock'

export interface WovenHeroProps {
  safeToSpend: number
  daysLeft: number
  /** recurring expense charges still to hit this month (see useUpcomingBills);
   *  the SAFE sub-line deducts them so "ใช้ได้วันละ" isn't a lie. Default 0. */
  upcomingBills?: number
  deltaPct: number | null
  budgetTotal: number
  budgetSpending: number
  stock: SalesSummary
  hideBalance: boolean
  onToggleHide: () => void
  /** brand-new user with no data yet → show the empty invitation label instead */
  empty?: boolean
  /** play the new-month rollover animation once (see useHomeMoments) */
  newMonth?: boolean
  /** play the first-sale-of-month beat on STOCK PROFIT once */
  firstSale?: boolean
}

// ── pure text selection (exported for tests) ─────────────────────────────────

const MASK_BIG = '฿ ••••••'
const MASK_MINI = '••••'

/** SAFE headline. Masked entirely while the balance is hidden. */
export function safeBig(safeToSpend: number, hideBalance: boolean): string {
  return hideBalance ? MASK_BIG : formatBaht(safeToSpend)
}

/** SAFE folded-strip figure. Hidden together with the headline so the eye toggle
 *  genuinely hides the balance — otherwise the number still leaks on the strip. */
export function safeMini(safeToSpend: number, hideBalance: boolean): string {
  return hideBalance ? MASK_MINI : formatBaht(safeToSpend)
}

/** Over-budget amount, or null when within budget / no budget set. Threshold
 *  matches computePace's 'over' state (spending strictly above the total). */
export function budgetOverAmount(budgetTotal: number, budgetSpending: number): number | null {
  return budgetTotal > 0 && budgetSpending > budgetTotal ? budgetSpending - budgetTotal : null
}

/** BUDGET sub-line. Prompts to set a budget when none exists. */
export function budgetSubline(
  budgetTotal: number,
  budgetSpending: number,
): { unset: boolean; text: string } {
  if (budgetTotal === 0) return { unset: true, text: 'ยังไม่ได้ตั้งงบ' }
  return {
    unset: false,
    text: `ใช้ไปแล้ว ${formatBaht(budgetSpending)} (ไม่รวมต้นทุนขาย)`,
  }
}

/** BUDGET folded-strip figure — the overshoot when over, else the budget total. */
export function budgetMini(budgetTotal: number, budgetSpending: number): string {
  const over = budgetOverAmount(budgetTotal, budgetSpending)
  return over != null ? `เกิน ${formatBaht(over)}` : formatBaht(budgetTotal)
}

/** Over-budget chip text, or null when there is no overshoot to warn about. */
export function overBudgetChip(budgetTotal: number, budgetSpending: number): string | null {
  const over = budgetOverAmount(budgetTotal, budgetSpending)
  return over != null ? `เกินงบ ${formatBaht(over)}` : null
}

/** STOCK sub-line. Falls back to an empty-state when nothing sold this month. */
export function stockSubline(stock: SalesSummary): string {
  if (stock.qty_sold === 0) return 'ยังไม่มีการขายเดือนนี้'
  return `ขาย ${formatBaht(stock.revenue)} · ต้นทุน ${formatBaht(stock.cogs)} · ${stock.qty_sold} ชิ้น`
}

/** Delta-vs-last-month chip, or null when there is no comparison basis. */
export function deltaChip(deltaPct: number | null): { up: boolean; text: string } | null {
  if (deltaPct == null) return null
  const up = deltaPct >= 0
  return { up, text: `${Math.abs(deltaPct)}% ${up ? 'ดีกว่า' : 'ต่ำกว่า'}เดือนก่อน` }
}

// ── geometry (px, viewport width 390–414) ────────────────────────────────────

const CONTAINER_H = 254
const LABEL_H = 158

/** transform + stacking for the front label (index 0) and the two folded behind.
 *  Each folded label peeks 48px — enough to reveal its whole header strip
 *  (selvedge + eyebrow title + compact figure) above the fold, so the title
 *  reads as a heading and signals the card can be tapped, not as blank fabric. */
const POSITIONS: { transform: string; z: number }[] = [
  { transform: 'translateY(96px)', z: 4 },
  { transform: 'translateY(48px) scale(.976) rotate(-1deg)', z: 3 },
  { transform: 'translateY(0) scale(.951) rotate(.8deg)', z: 2 },
]

const CANON: HeroKey[] = ['safe', 'budget', 'stock']

const EYEBROW: Record<HeroKey, string> = {
  safe: 'SAFE TO SPEND',
  budget: 'BUDGET',
  stock: 'STOCK PROFIT',
}

const ARIA: Record<HeroKey, string> = {
  safe: 'ป้ายยอดใช้ได้',
  budget: 'ป้ายงบประมาณ',
  stock: 'ป้ายกำไรสต็อก',
}

const FABRIC: Record<HeroKey, string> = {
  safe: 'bg-brand-fabric',
  budget: 'bg-brand-fabric-budget',
  stock: 'bg-brand-fabric-stock',
}

export function WovenHero({
  safeToSpend,
  daysLeft,
  upcomingBills = 0,
  deltaPct,
  budgetTotal,
  budgetSpending,
  stock,
  hideBalance,
  onToggleHide,
  empty = false,
  newMonth = false,
  firstSale = false,
}: WovenHeroProps) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<HeroKey>('safe')

  if (empty) return <WovenHeroEmpty onStart={() => navigate('/add')} />

  // front label first, the rest keep their canonical order behind it → each key
  // maps to position 0/1/2 deterministically.
  const order: HeroKey[] = [selected, ...CANON.filter((k) => k !== selected)]

  return (
    <div
      className={`relative${newMonth ? ' animate-weave-in motion-reduce:animate-none' : ''}`}
      style={{ height: CONTAINER_H }}
    >
      {order.map((key, pos) => {
        const isFront = pos === 0
        const { transform, z } = POSITIONS[pos]
        return (
          <button
            key={key}
            type="button"
            onClick={() => !isFront && setSelected(key)}
            aria-expanded={isFront}
            aria-label={ARIA[key]}
            // flex flex-col is load-bearing, not cosmetic: a <button> wraps its
            // content in an anonymous CENTERED box, so with this fixed-height
            // label the header strip gets centred ~64px down — below the 48px a
            // folded label peeks — and the eyebrow/figure vanish behind the label
            // in front (the production "blank folded strips" bug). flex makes the
            // button a real flex container so justify-content:flex-start pins the
            // strip to the top, inside the peek. Do NOT drop it. (jsdom doesn't
            // model button centring, which is why the DOM test missed this.)
            className={`woven ${FABRIC[key]} absolute flex flex-col overflow-hidden text-left text-brand-thread shadow-[0_6px_16px_rgba(0,0,0,0.28)] transition-transform duration-label ease-label motion-reduce:transition-none`}
            style={{
              left: 2,
              right: 2,
              top: 0,
              height: LABEL_H,
              borderRadius: 3,
              transformOrigin: '50% 0',
              transform,
              zIndex: z,
            }}
          >
            {/* selvedge edges */}
            <span aria-hidden className="selvedge absolute inset-x-0 top-0 h-[7px]" />
            <span aria-hidden className="selvedge absolute inset-x-0 bottom-0 h-[7px]" />

            {/* header strip — always visible (this is what peeks when folded) */}
            <div className="relative mt-[7px] flex h-[34px] items-center justify-between px-[18px]">
              <span
                className={`text-[10px] font-medium uppercase ${
                  isFront ? 'opacity-[.86]' : 'opacity-100'
                }`}
                style={{ letterSpacing: '0.17em' }}
              >
                {EYEBROW[key]}
              </span>
              {/* The front label carries no right-side content: its eye toggle
                  lives OUTSIDE the label button (rendered after this map) so we
                  never nest one <button> in another. Folded labels still show
                  their compact figure here. */}
              {!isFront && (
                <span
                  className={`text-[13px] font-medium tabular-nums opacity-[.92]${
                    key === 'stock' && firstSale
                      ? ' inline-block animate-moment-pop motion-reduce:animate-none'
                      : ''
                  }`}
                >
                  {key === 'safe'
                    ? safeMini(safeToSpend, hideBalance)
                    : key === 'budget'
                      ? budgetMini(budgetTotal, budgetSpending)
                      : formatBaht(stock.profit)}
                </span>
              )}
            </div>

            {/* full headline — front label only */}
            {isFront && (
              <div className="relative px-[18px] pt-1">
                {key === 'safe' && (
                  <SafeBody
                    safeToSpend={safeToSpend}
                    daysLeft={daysLeft}
                    upcomingBills={upcomingBills}
                    deltaPct={deltaPct}
                    hideBalance={hideBalance}
                  />
                )}
                {key === 'budget' && (
                  <BudgetBody
                    budgetTotal={budgetTotal}
                    budgetSpending={budgetSpending}
                    onSetBudget={() => navigate('/budget')}
                  />
                )}
                {key === 'stock' && <StockBody stock={stock} pop={firstSale} />}
              </div>
            )}
          </button>
        )
      })}

      {/* Hide-balance eye — a SIBLING of the labels, never nested in one (nesting
          a <button> in a <button> is invalid HTML, mis-serialises in the visual
          harness, and breaks keyboard/AT semantics). Shown only when SAFE is the
          front label, and stacked above it (z-10 > the labels' z 2–4) so a tap
          lands on the eye, not the label. Positioned to sit exactly where the icon
          used to render inside the header strip: the front label sits at
          translateY(96px), its 34px strip starts at mt-[7px] (centre y = 96+7+17 =
          120) and ends 20px in from the container's right edge (label right:2 +
          px-[18px]) — so a 44px touch target centred on the old 16px icon lands at
          top:98, right:8. Nothing moves on screen; the hit area just grows. */}
      {selected === 'safe' && (
        <button
          type="button"
          onClick={onToggleHide}
          aria-label={hideBalance ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน'}
          aria-pressed={hideBalance}
          className="absolute z-10 flex h-11 w-11 items-center justify-center text-brand-thread"
          style={{ top: 98, right: 8 }}
        >
          {hideBalance ? (
            <IconEyeOff size={16} className="opacity-70" />
          ) : (
            <IconEye size={16} className="opacity-70" />
          )}
        </button>
      )}
    </div>
  )
}

function BigNumber({ children }: { children: string }) {
  return <p className="text-[38px] font-semibold leading-tight tabular-nums">{children}</p>
}

function SubLine({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[12.5px] opacity-[.84]">{children}</p>
}

function Chip({
  icon: Icon,
  children,
}: {
  icon: typeof IconAlertTriangle
  children: ReactNode
}) {
  return (
    <span className="mt-2 inline-flex items-center gap-1 rounded-pill bg-white/[0.14] px-[9px] py-[3px] text-[11.5px] font-medium">
      <Icon size={13} />
      {children}
    </span>
  )
}

function SafeBody({
  safeToSpend,
  daysLeft,
  upcomingBills,
  deltaPct,
  hideBalance,
}: {
  safeToSpend: number
  daysLeft: number
  upcomingBills: number
  deltaPct: number | null
  hideBalance: boolean
}) {
  const view = computeSpendable(safeToSpend, upcomingBills, daysLeft)
  // With bills the sub-line runs to two lines; the fixed 158px label then has no
  // room left for the delta chip (measured: it lands flush on the bottom edge at
  // 390px). Bills are the priority here, so drop the secondary month-over-month
  // chip in that case rather than clip it — never both at once.
  const delta = view.bills > 0 ? null : deltaChip(deltaPct)
  return (
    <>
      <BigNumber>{safeBig(safeToSpend, hideBalance)}</BigNumber>
      <SubLine>{safeSublineContent(view, hideBalance)}</SubLine>
      {delta && (
        <Chip icon={delta.up ? IconTrendingUp : IconTrendingDown}>{delta.text}</Chip>
      )}
    </>
  )
}

/**
 * Render the SAFE sub-line from the pure SpendableView. Every baht is masked when
 * the balance is hidden (the days-left text stays), so the sub-line hides in step
 * with the headline. The over-committed case leads with a warning icon so it never
 * signals by wording (or colour) alone.
 */
function safeSublineContent(view: SpendableView, hideBalance: boolean): ReactNode {
  const money = (v: number) => (hideBalance ? MASKED_BAHT : formatBaht(v))
  const daysText = `เหลืออีก ${view.daysLeft} วัน`
  if (view.over > 0) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1">
        <IconAlertTriangle size={12} className="shrink-0" aria-hidden />
        <span>
          {daysText} · หักบิลที่จะมาถึง {money(view.bills)} · เกินยอดที่ใช้ได้ {money(view.over)}
        </span>
      </span>
    )
  }
  if (view.bills > 0) {
    return view.perDay != null
      ? `${daysText} · หักบิลที่จะมาถึง ${money(view.bills)} · ใช้ได้วันละ ${money(view.perDay)}`
      : `${daysText} · หักบิลที่จะมาถึง ${money(view.bills)}`
  }
  return view.perDay != null
    ? `${daysText} · เฉลี่ยวันละ ${money(view.perDay)}`
    : daysText
}

function BudgetBody({
  budgetTotal,
  budgetSpending,
  onSetBudget,
}: {
  budgetTotal: number
  budgetSpending: number
  onSetBudget: () => void
}) {
  const sub = budgetSubline(budgetTotal, budgetSpending)
  const chip = overBudgetChip(budgetTotal, budgetSpending)
  return (
    <>
      <BigNumber>{formatBaht(budgetTotal)}</BigNumber>
      {sub.unset ? (
        <SubLine>
          {sub.text}
          {' · '}
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onSetBudget()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                onSetBudget()
              }
            }}
            className="underline underline-offset-2"
          >
            ตั้งงบ
          </span>
        </SubLine>
      ) : (
        <SubLine>{sub.text}</SubLine>
      )}
      {chip && <Chip icon={IconAlertTriangle}>{chip}</Chip>}
    </>
  )
}

function StockBody({ stock, pop = false }: { stock: SalesSummary; pop?: boolean }) {
  return (
    <>
      <div className={pop ? 'inline-block animate-moment-pop motion-reduce:animate-none' : undefined}>
        <BigNumber>{formatBaht(stock.profit)}</BigNumber>
      </div>
      <SubLine>{stockSubline(stock)}</SubLine>
    </>
  )
}

/**
 * Empty state — the hero as a woven label that hasn't been woven yet: one faint
 * fabric label with a single invitation and one button to log the first entry
 * (no ฿0, no apology). Still the hero, still the only textured element on the
 * page (design-spec §2 "one per page"). */
function WovenHeroEmpty({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative animate-weave-in motion-reduce:animate-none" style={{ height: CONTAINER_H }}>
      <div
        className="woven bg-brand-fabric absolute inset-x-0.5 top-0 flex flex-col justify-center overflow-hidden text-brand-thread opacity-90 shadow-[0_6px_16px_rgba(0,0,0,0.28)]"
        style={{ height: LABEL_H, borderRadius: 3 }}
      >
        <span aria-hidden className="selvedge absolute inset-x-0 top-0 h-[7px]" />
        <span aria-hidden className="selvedge absolute inset-x-0 bottom-0 h-[7px]" />
        <div className="px-[18px]">
          <p className="text-[10px] font-medium uppercase opacity-70" style={{ letterSpacing: '0.17em' }}>
            STASH
          </p>
          <p className="mt-1.5 text-[19px] font-medium leading-snug">เริ่มบันทึกรายการแรกของคุณ</p>
          <p className="mt-1 text-[12.5px] opacity-80">ป้ายทอใบนี้จะค่อย ๆ เต็มไปด้วยตัวเลขของคุณเอง</p>
          <button
            type="button"
            onClick={onStart}
            className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-btn bg-brand-thread px-4 py-2 text-[13px] font-medium text-brand-fabric"
          >
            <IconPlus size={16} />
            เพิ่มรายการแรก
          </button>
        </div>
      </div>
    </div>
  )
}
