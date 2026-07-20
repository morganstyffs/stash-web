import type { DonutSlice } from '@/hooks/useHome'

/** Category donut — one arc per slice, sized by share of total expense. */
export function Donut({ slices }: { slices: DonutSlice[] }) {
  const R = 32
  const C = 2 * Math.PI * R // ≈ 201
  const total = slices.reduce((s, x) => s + x.total, 0) || 1

  let offset = 0
  return (
    <svg viewBox="0 0 80 80" className="h-[76px] w-[76px] shrink-0">
      <circle cx="40" cy="40" r={R} fill="none" stroke="#F1F2F3" strokeWidth="11" />
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
  )
}

/** Cumulative-expense trend line for the month. */
export function TrendLine({ data }: { data: number[] }) {
  const W = 288
  const max = Math.max(...data, 1)
  const n = data.length
  const points = data.map((v, i) => {
    const x = n > 1 ? (i / (n - 1)) * W : 0
    const y = 58 - (v / max) * 48
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = points[points.length - 1]?.split(',') ?? ['0', '58']

  return (
    <svg viewBox="0 0 288 70" className="h-16 w-full">
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="#2CC0A0"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="4" fill="#2CC0A0" />
    </svg>
  )
}
