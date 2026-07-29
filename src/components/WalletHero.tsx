import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconBolt,
  IconChevronRight,
  IconDots,
  IconEye,
  IconEyeOff,
  IconMicrophone,
  IconScan,
} from '@tabler/icons-react'
import { formatBaht } from '@/lib/format'
import { computePace } from '@/hooks/useBudgets'
import stashLogo from '@/assets/stash-logo-emboss.png'

/**
 * Home "wallet / card-holder" hero.
 *
 * Three summary cards (income · budget · expense) sit tucked into a mint pocket
 * whose top edge dips into a concave slot in the middle and rises into rounded
 * shoulders at the wider left/right — like a real leather card holder. Tapping a
 * card slides it up out of the pocket and brings it forward to reveal extra
 * sub-info and a "ดูรายละเอียด" link. Tapping it again tucks it back.
 *
 * The slide distance is derived from the real free space above the pocket (so a
 * lifted card never collides with the page header), not a fixed constant — pass
 * `getSafeTopY` to report the lowest viewport-Y a card may rise to.
 */

// ── geometry (px, in the wallet's own coordinate space) ──────────────────────
const SIDE = 18 // card horizontal inset → the mint pocket peeks past the cards
const CARD_H = 116
const REST_TOPS = [4, 32, 60] // fanned resting offsets (green, yellow, black)
const Y_SHOULDER = 90 // raised shoulders of the pocket lip
const Y_DIP = 102 // concave centre of the pocket lip (the "slot")
const CORNER_R = 20
const WALLET_H = 362
const CONTENT_TOP = 180 // balance/actions sit below the deepest card at rest
const DASH_INSET = 7
const DESIRED_LIFT = 46
const MIN_LIFT = 8

/** Build the pocket outline: concave dip in the centre, rounded raised shoulders. */
function walletPath(w: number, inset = 0, bottomInset = 0): string {
  const l = inset
  const rgt = w - inset
  const bot = WALLET_H - bottomInset
  const r = CORNER_R
  return [
    `M${l},${bot}`,
    `L${l},${Y_SHOULDER + r}`,
    `Q${l},${Y_SHOULDER} ${l + r},${Y_SHOULDER}`,
    `L${w * 0.31},${Y_SHOULDER}`,
    `C${w * 0.41},${Y_SHOULDER} ${w * 0.41},${Y_DIP} ${w * 0.5},${Y_DIP}`,
    `C${w * 0.59},${Y_DIP} ${w * 0.59},${Y_SHOULDER} ${w * 0.69},${Y_SHOULDER}`,
    `L${rgt - r},${Y_SHOULDER}`,
    `Q${rgt},${Y_SHOULDER} ${rgt},${Y_SHOULDER + r}`,
    `L${rgt},${bot}`,
    'Z',
  ].join(' ')
}

type CardKey = 'income' | 'budget' | 'expense'

interface HeroCard {
  key: CardKey
  label: string
  value: number
  to: string
  /** small stat rows revealed when the card is pulled out */
  subs: { label: string; value: string; valueClass?: string }[]
  cardClass: string
  buttonClass: string
}

export interface WalletHeroProps {
  income: number
  incomeCount: number
  budgetTotal: number
  budgetSpending: number
  expense: number
  expenseCount: number
  topCategory: { name: string; total: number } | null
  safeToSpend: number
  deltaPct: number | null
  hideBalance: boolean
  onToggleHide: () => void
  onQuickAdd: () => void
  /** Report the lowest viewport-Y a pulled card may reach (e.g. header bottom). */
  getSafeTopY?: () => number
}

export function WalletHero({
  income,
  incomeCount,
  budgetTotal,
  budgetSpending,
  expense,
  expenseCount,
  topCategory,
  safeToSpend,
  deltaPct,
  hideBalance,
  onToggleHide,
  onQuickAdd,
  getSafeTopY,
}: WalletHeroProps) {
  const navigate = useNavigate()
  const walletRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(360)
  const [selected, setSelected] = useState<number | null>(null)
  const [lift, setLift] = useState(0)

  // Keep the SVG viewBox matched to the real pixel width → crisp, undistorted
  // shoulders and dashes at any screen size.
  useLayoutEffect(() => {
    const el = walletRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth || 360)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Budget figures compare against isBudgetSpendingRow spending (COGS excluded),
  // NOT the COGS-inclusive `expense` headline (B1). computePace surfaces the
  // over-budget amount that the old Math.max(0, …) clamp hid (B2).
  const pct = budgetTotal > 0 ? Math.round((budgetSpending / budgetTotal) * 100) : null
  const pace = computePace(budgetSpending, budgetTotal)
  const paceClass =
    pace.state === 'over' ? 'text-expense' : pace.state === 'fast' ? 'text-warn' : undefined
  const avgIncome = incomeCount > 0 ? income / incomeCount : 0

  const cards: HeroCard[] = [
    {
      key: 'income',
      label: 'รายรับเดือนนี้',
      value: income,
      to: '/history?filter=income',
      subs: [
        { label: 'รายการเข้า', value: `${incomeCount} รายการ` },
        { label: 'เฉลี่ย / รายการ', value: formatBaht(avgIncome) },
      ],
      cardClass: 'bg-cat-green text-cat-green-ink',
      buttonClass: 'bg-cat-green-ink/[0.14] text-cat-green-ink',
    },
    {
      key: 'budget',
      label: 'งบที่ตั้งไว้',
      value: budgetTotal,
      to: '/budget',
      subs: [
        {
          label: 'ใช้ไปแล้ว',
          value:
            pct != null
              ? `${formatBaht(budgetSpending)} · ${pct}%`
              : formatBaht(budgetSpending),
        },
        { label: 'สถานะ', value: pace.note, valueClass: paceClass },
      ],
      cardClass: 'bg-cat-yellow text-cat-yellow-ink',
      buttonClass: 'bg-cat-yellow-ink/[0.14] text-cat-yellow-ink',
    },
    {
      key: 'expense',
      label: 'รายจ่ายเดือนนี้',
      value: expense,
      to: '/history?filter=expense',
      subs: [
        { label: 'รายการออก', value: `${expenseCount} รายการ` },
        {
          label: 'หมวดสูงสุด',
          value: topCategory ? `${topCategory.name} ${formatBaht(topCategory.total)}` : '—',
        },
      ],
      cardClass: 'bg-cat-black text-cat-black-ink',
      buttonClass: 'bg-white/[0.16] text-white',
    },
  ]

  const toggle = useCallback(
    (i: number) => {
      if (selected === i) {
        setSelected(null)
        return
      }
      // How far this card may rise before its top would cross the safe line
      // (header bottom). Real free space, recomputed per tap — never constant.
      const walletTop = walletRef.current?.getBoundingClientRect().top ?? 0
      const safeTop = getSafeTopY?.() ?? 0
      const gap = walletTop - safeTop
      const pull = Math.max(MIN_LIFT, Math.min(DESIRED_LIFT, REST_TOPS[i] + gap))
      setLift(pull)
      setSelected(i)
    },
    [selected, getSafeTopY],
  )

  return (
    <div ref={walletRef} className="relative z-0" style={{ minHeight: WALLET_H }}>
      {/* summary cards, tucked into the pocket */}
      {cards.map((c, i) => {
        const active = selected === i
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => toggle(i)}
            aria-expanded={active}
            className={`absolute overflow-hidden rounded-[14px] px-[15px] text-left shadow-[0_2px_8px_rgba(20,30,28,0.10)] transition-[transform,box-shadow] duration-[420ms] ease-[cubic-bezier(.22,1,.36,1)] ${c.cardClass} ${
              active ? 'shadow-[0_16px_34px_rgba(20,30,28,0.30)]' : ''
            }`}
            style={{
              left: SIDE,
              right: SIDE,
              top: REST_TOPS[i],
              height: CARD_H,
              zIndex: active ? 30 : 12 + i,
              transform: active ? `translateY(-${lift}px)` : undefined,
            }}
          >
            <div className="flex h-[28px] items-center justify-between">
              <span className="text-[13px] font-medium">{c.label}</span>
              <span className="text-[13px] font-medium">{formatBaht(c.value)}</span>
            </div>
            <div className="pt-0.5">
              {c.subs.map((s) => (
                <div
                  key={s.label}
                  className="flex justify-between py-0.5 text-[11px] opacity-90"
                >
                  <span>{s.label}</span>
                  <span className={s.valueClass}>{s.value}</span>
                </div>
              ))}
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  navigate(c.to)
                }}
                className={`mt-2 flex items-center justify-center gap-0.5 rounded-[10px] py-2 text-[12px] font-medium ${c.buttonClass}`}
              >
                ดูรายละเอียด
                <IconChevronRight size={13} className="opacity-70" />
              </span>
            </div>
          </button>
        )
      })}

      {/* the mint pocket — painted only; never swallow taps meant for the cards */}
      <svg
        className="pointer-events-none relative block w-full drop-shadow-[0_10px_22px_rgba(14,125,102,0.28)]"
        width={width}
        height={WALLET_H}
        viewBox={`0 0 ${width} ${WALLET_H}`}
        preserveAspectRatio="none"
        style={{ zIndex: 20 }}
      >
        <defs>
          <linearGradient id="walletMint" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2CC0A0" />
            <stop offset="1" stopColor="#0E7D66" />
          </linearGradient>
        </defs>
        <path d={walletPath(width)} fill="url(#walletMint)" />
        <path
          d={walletPath(width, DASH_INSET, DASH_INSET)}
          fill="none"
          stroke="rgba(255,255,255,0.24)"
          strokeWidth={1.5}
          strokeDasharray="5 5"
        />
      </svg>

      {/* pocket-face guard: swallows taps on the empty pocket so they don't reach
          the hidden card bodies behind it, and closes an open card. It starts at
          the lip, leaving the peeking card headers above it tappable. */}
      <div
        aria-hidden
        onClick={() => setSelected(null)}
        className="absolute inset-x-0 bottom-0"
        style={{ top: Y_SHOULDER, zIndex: 22 }}
      />

      {/* STASH deboss, pressed into the top of the mint pocket face — the emboss
          is baked into the PNG (transparent centre), so add no shadow/filter here.
          Absolutely positioned so it never nudges the balance/actions below. */}
      <img
        src={stashLogo}
        alt="STASH"
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute left-1/2 h-auto w-[58%] max-w-[260px] -translate-x-1/2 select-none"
        style={{ top: 104, zIndex: 21 }}
      />

      {/* balance + quick actions, printed on the pocket face */}
      <div
        className="absolute inset-x-0 px-[26px]"
        style={{ top: CONTENT_TOP, zIndex: 25 }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[12px] text-white/70">เหลือใช้ได้เดือนนี้</p>
            <p className="mt-1 flex items-center gap-1.5 text-[30px] font-medium tracking-[-0.5px] text-white">
              {hideBalance ? '฿ ••••••' : formatBaht(safeToSpend)}
              <button
                type="button"
                onClick={onToggleHide}
                aria-label={hideBalance ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน'}
                aria-pressed={hideBalance}
                className="p-0.5"
              >
                {hideBalance ? (
                  <IconEyeOff size={16} className="text-white/60" />
                ) : (
                  <IconEye size={16} className="text-white/60" />
                )}
              </button>
            </p>
            {deltaPct != null && (
              <span className="mt-2 inline-block rounded-pill bg-mint-hero px-[9px] py-[3px] text-[11px] font-medium text-mint-text">
                {deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)}%{' '}
                {deltaPct >= 0 ? 'ดีกว่า' : 'ต่ำกว่า'}เดือนก่อน
              </span>
            )}
          </div>
          <span className="rounded-pill border border-white/30 px-3 py-[5px] text-[12px] text-white">
            เดือนนี้
          </span>
        </div>

        <div className="mt-4 flex gap-2">
          <HeroAction icon={IconBolt} label="เพิ่มเร็ว" onClick={onQuickAdd} />
          <HeroAction icon={IconScan} label="สแกนสลิป" soon />
          <HeroAction icon={IconMicrophone} label="พิมพ์/พูด" soon />
          <HeroAction icon={IconDots} label="อื่นๆ" />
        </div>
      </div>
    </div>
  )
}

function HeroAction({
  icon: Icon,
  label,
  onClick,
  soon,
}: {
  icon: typeof IconBolt
  label: string
  onClick?: () => void
  soon?: boolean
}) {
  const disabled = !onClick
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={soon ? 'เร็วๆ นี้' : undefined}
      aria-label={soon ? `${label} (เร็วๆ นี้)` : label}
      className={`flex-1 rounded-[12px] border border-white/[0.22] px-1 py-2.5 text-center ${
        disabled ? 'cursor-not-allowed opacity-45' : ''
      }`}
    >
      <Icon size={19} className="mx-auto text-white" />
      <p className="mt-1.5 text-[11px] text-white">{label}</p>
      {soon && <p className="text-[9px] leading-tight text-white/60">เร็วๆ นี้</p>}
    </button>
  )
}
