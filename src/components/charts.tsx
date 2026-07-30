import type { DonutSlice } from '@/hooks/useHome'
import { formatBaht, MASKED_BAHT } from '@/lib/format'

// ── donut centre total: font size by string length ───────────────────────────
// The total sits inside the ring, so a long value (฿48,052, and worse) overruns
// the hole. Geometry of the Donut below: R=32, strokeWidth=11 → inner hole
// radius 26.5 viewBox units; viewBox 80 rendered at 76px → scale 0.95 → ~25.2px
// inner radius. The total is the top line of a two-line stack (number + "รวม"),
// so the number's band is ~±12.5px off-centre; the usable chord there is
// 2·√(25.2² − 12.5²) ≈ 43.8px.
//
// "฿48,052" (7 chars) measures ~50px at 13px / Prompt 500 with tabular figures
// (~7.14px per char at 13px). tnum ⇒ fixed advance ⇒ width scales linearly with
// char count and size, so the largest size that fits is
//   13 · 43.8 / (chars · 7.14),  capped at 13, floored at 11.
// 11px is the readability floor: a value that needs < 11px to fit (≥10 chars,
// i.e. ≥7 figures) is clamped to 11 and WILL still overflow — that's the signal
// the number belongs OUTSIDE the ring (owner decision), not shrunk further.
export const DONUT_CENTER_FONT_MAX = 13
export const DONUT_CENTER_FONT_MIN = 11
const DONUT_CENTER_INNER_CHORD = 43.8
const DONUT_CENTER_CHAR_W_AT_MAX = 50 / 7 // ≈7.14px per char at 13px (฿48,052)

/** Font size (px) for the donut's centre total, chosen from the display string's
 *  length. Pure + unit-tested (charts.test.ts). See the geometry note above. */
export function donutCenterFontSize(charCount: number): number {
  if (charCount <= 0) return DONUT_CENTER_FONT_MAX
  const widthAtMax = charCount * DONUT_CENTER_CHAR_W_AT_MAX
  const fit = Math.floor(DONUT_CENTER_FONT_MAX * (DONUT_CENTER_INNER_CHORD / widthAtMax))
  return Math.max(DONUT_CENTER_FONT_MIN, Math.min(DONUT_CENTER_FONT_MAX, fit))
}

/** Category donut — one arc per slice, sized by share of total expense. The
 *  centre total is masked (name/percent stay) when the balance is hidden. */
export function Donut({ slices, hideBalance = false }: { slices: DonutSlice[]; hideBalance?: boolean }) {
  const R = 32
  const C = 2 * Math.PI * R // ≈ 201
  const total = slices.reduce((s, x) => s + x.total, 0) || 1

  let offset = 0
  return (
    <div className="relative shrink-0">
      <svg viewBox="0 0 80 80" className="h-[76px] w-[76px]">
        <circle cx="40" cy="40" r={R} fill="none" className="stroke-fill" strokeWidth="11" />
        {slices.map((s) => {
          const dash = (s.total / total) * C
          const el = (
            <circle
              key={s.categoryId}
              cx="40"
              cy="40"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="11"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 40 40)"
            />
          )
          offset += dash
          return el
        })}
      </svg>
      {/* total spend in the middle of the ring */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
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
        <span className="mt-0.5 text-[9px] leading-none text-faint">รวม</span>
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
