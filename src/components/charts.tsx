import type { DonutSlice } from '@/lib/homeSummary'
import { catColorVar } from '@/lib/catColor'
import { formatBaht, MASKED_BAHT } from '@/lib/format'

// ── donut geometry + centre-total sizing ─────────────────────────────────────
// The total sits inside the ring; whether it fits depends on the hole size AND
// where the text sits in the hole. PR #68 shrank the font to cope; the real fix
// (owner's call, over shortening to ฿1.23M or moving the number out) is to widen
// the hole, done two ways:
//   • Ring: R=32 vbu, strokeWidth 9 (was 11) → inner hole radius 27.5 vbu.
//     viewBox 80 rendered at 90px (was 76) → scale 1.125 → inner radius ≈ 30.9px
//     (hole ⌀ ≈ 61.9px).
//   • Text: ONE line, centred (the "รวม" label is gone — the card is titled
//     "หมวดใช้จ่าย" and a number inside a ring reads as a total). A single line
//     sits on the widest chord — the diameter through the centre — which returns
//     MORE room than the thinner ring does; a second line would push the number
//     onto a narrower chord.
// A box of height h centred in a circle of radius r fits when its CORNERS do:
// (w/2)² + (h/2)² ≤ r². With leading-none the box height ≈ font size F, so the
// largest F whose box fits is  F ≤ 2r / √((k·chars)² + 1),  where k = per-char
// advance ÷ F. k=0.5 is a safe upper bound for Prompt 500 tabular baht strings
// (measured in a real browser: digit 0.50em, comma 0.25em, ฿ 0.63em; long totals
// average ~0.46em, so 0.5 never under-shrinks a real total). Capped at 13,
// floored at 11. With this hole every realistic total up to ฿1,234,567 fits at
// ≥12px; a value that would need <11px to fit is clamped to 11 and caught by the
// visual guard (charts.visual.test.ts), never silently shrunk into the ring.
export const DONUT_RENDER_PX = 90
const DONUT_STROKE = 9
const DONUT_R_VBU = 32
const DONUT_VIEWBOX = 80
const DONUT_INNER_RADIUS_PX =
  (DONUT_R_VBU - DONUT_STROKE / 2) * (DONUT_RENDER_PX / DONUT_VIEWBOX) // ≈ 30.94
const DONUT_CENTER_CHAR_RATIO = 0.5
export const DONUT_CENTER_FONT_MAX = 13
export const DONUT_CENTER_FONT_MIN = 11

/** Font size (px) for the donut's centre total, chosen from the display string's
 *  length so its box fits inside the ring's inner hole. Pure + unit-tested
 *  (charts.test.ts) and geometry-verified in a real browser (charts.visual.test.ts).
 *  See the geometry note above. */
export function donutCenterFontSize(charCount: number): number {
  if (charCount <= 0) return DONUT_CENTER_FONT_MAX
  const fit =
    (2 * DONUT_INNER_RADIUS_PX) / Math.sqrt((DONUT_CENTER_CHAR_RATIO * charCount) ** 2 + 1)
  return Math.max(DONUT_CENTER_FONT_MIN, Math.min(DONUT_CENTER_FONT_MAX, Math.floor(fit)))
}

/** Category donut — one arc per slice, sized by share of total expense. The
 *  centre total is masked (name/percent stay) when the balance is hidden. */
export function Donut({ slices, hideBalance = false }: { slices: DonutSlice[]; hideBalance?: boolean }) {
  const R = DONUT_R_VBU
  const C = 2 * Math.PI * R // ≈ 201
  const total = slices.reduce((s, x) => s + x.total, 0) || 1

  let offset = 0
  return (
    <div className="relative shrink-0">
      <svg
        viewBox="0 0 80 80"
        style={{ width: DONUT_RENDER_PX, height: DONUT_RENDER_PX }}
      >
        <circle cx="40" cy="40" r={R} fill="none" className="stroke-fill" strokeWidth={DONUT_STROKE} />
        {slices.map((s) => {
          const dash = (s.total / total) * C
          const el = (
            <circle
              key={s.categoryId}
              cx="40"
              cy="40"
              r={R}
              fill="none"
              stroke={catColorVar(s.colorIndex)}
              strokeWidth={DONUT_STROKE}
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 40 40)"
            />
          )
          offset += dash
          return el
        })}
      </svg>
      {/* total spend in the middle of the ring — one line, on the widest chord */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {(() => {
          const label = hideBalance
            ? MASKED_BAHT
            : formatBaht(slices.reduce((s, x) => s + x.total, 0))
          return (
            <span
              className="font-medium leading-none tracking-[-0.3px] tabular-nums"
              style={{ fontSize: donutCenterFontSize(label.length) }}
            >
              {label}
            </span>
          )
        })()}
      </div>
    </div>
  )
}

// trend-line geometry (viewBox units)
const GUTTER = 38 // left space reserved for the y-axis money labels
const PLOT_L = GUTTER + 2
const PLOT_R = 316
const PLOT_W = PLOT_R - PLOT_L
const TOP = 10 // y for the highest gridline
const BOTTOM = 128 // y for the 0 gridline
const PLOT_H = BOTTOM - TOP
const STEP = 10_000 // gridline every ฿10,000

/**
 * Month trend — cumulative income (green) vs expense (red), on a fixed money
 * scale with labelled horizontal gridlines. Pass `sparseLabels` to only label
 * every ฿20,000 (a lighter look for tight mobile widths).
 */
export function TrendLine({
  income,
  expense,
  sparseLabels = false,
}: {
  income: number[]
  expense: number[]
  sparseLabels?: boolean
}) {
  const n = Math.max(income.length, expense.length)
  const dataMax = Math.max(...income, ...expense, 0)
  // fixed 0–50,000 scale, but grow in ฿10,000 steps if a line runs higher
  const niceMax = Math.max(50_000, Math.ceil(dataMax / STEP) * STEP)
  const levels: number[] = []
  for (let v = 0; v <= niceMax; v += STEP) levels.push(v)

  const yOf = (v: number) => BOTTOM - (v / niceMax) * PLOT_H
  const xOf = (i: number) => (n > 1 ? PLOT_L + (i / (n - 1)) * PLOT_W : PLOT_L)
  const toPoints = (data: number[]) =>
    data.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')

  const incLast = income.length ? { x: xOf(income.length - 1), y: yOf(income[income.length - 1]) } : null
  const expLast = expense.length ? { x: xOf(expense.length - 1), y: yOf(expense[expense.length - 1]) } : null

  // x-axis day markers (kept as before: 1 / 10 / 20 / last day)
  const dayMarks = [1, 10, 20, n]

  return (
    <svg viewBox="0 0 320 150" className="w-full" role="img" aria-label="แนวโน้มเงินเข้าและเงินออกรายวัน">
      {/* horizontal gridlines + money labels */}
      {levels.map((v) => {
        const y = yOf(v)
        const labelled = !sparseLabels || v % 20_000 === 0
        return (
          <g key={v}>
            <line x1={PLOT_L} y1={y} x2={PLOT_R} y2={y} className="stroke-hairline" strokeWidth="1" />
            {labelled && (
              <text
                x={GUTTER - 4}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                className="fill-faint"
              >
                {v.toLocaleString('en-US')}
              </text>
            )}
          </g>
        )
      })}

      {/* expense line (red) */}
      <polyline
        points={toPoints(expense)}
        fill="none"
        className="stroke-expense"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* income line (green) */}
      <polyline
        points={toPoints(income)}
        fill="none"
        className="stroke-income"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* end-of-line value dots */}
      {expLast && <circle cx={expLast.x} cy={expLast.y} r="4" className="fill-expense" />}
      {incLast && <circle cx={incLast.x} cy={incLast.y} r="4" className="fill-income" />}

      {/* x-axis day labels */}
      {dayMarks.map((d, i) => (
        <text
          key={i}
          x={xOf(d - 1)}
          y={BOTTOM + 16}
          textAnchor={i === 0 ? 'start' : i === dayMarks.length - 1 ? 'end' : 'middle'}
          fontSize="10"
          className="fill-faint"
        >
          {d}
        </text>
      ))}
    </svg>
  )
}
