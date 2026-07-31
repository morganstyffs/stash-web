import { useId } from 'react'

/**
 * โลโก้ Stash — หน้าปัดตู้เซฟ
 * สามชั้นสีมาจาก className ทั้งหมด ไม่มี hex ในไฟล์นี้ (กฎ §8-19)
 *   className     → เปลือกตู้: วงแหวน ซี่มือหมุน ฝาตู้   (มินต์)
 *   faceClassName → หน้าปัด                              (คราม)
 *   inkClassName  → ตา + ปาก                             (ขาว)
 *
 * variant compact ตัดซี่มือหมุนออกและขยายหน้า เพราะที่ 16px
 * ซี่เหลือความหนาไม่ถึง 1 พิกเซลและหน้าขนาดเดิมอ่านไม่ออก
 */
type BrandMarkProps = {
  variant?: 'full' | 'compact'
  size?: number
  className?: string
  faceClassName?: string
  inkClassName?: string
  /** ใส่เมื่อโลโก้สื่อความหมาย · ไม่ใส่ = decorative */
  title?: string
}

const CX = 27.9
const CY = 32

const RAYS = [
  [36.74, 23.16, 40.27, 19.63],
  [19.06, 23.16, 15.53, 19.63],
  [36.74, 40.84, 40.27, 44.37],
  [19.06, 40.84, 15.53, 44.37],
] as const

const GEO = {
  full: { fr: 9.1, rr: 23.0, rw: 4.0, eo: 3.25, ey1: 28.6, ey2: 30.5, ew: 2.05, sx: 3.8, sy: 33.9, sd: 37.6 },
  compact: { fr: 12.6, rr: 22.5, rw: 5.0, eo: 4.5, ey1: 27.6, ey2: 30.5, ew: 2.8, sx: 5.3, sy: 34.3, sd: 39.9 },
} as const

export function BrandMark({
  variant = 'full',
  size = 32,
  className,
  faceClassName = 'text-dial',
  inkClassName = 'text-white',
  title,
}: BrandMarkProps) {
  const titleId = useId()
  const g = GEO[variant]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? 'img' : undefined}
      aria-labelledby={title ? titleId : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title id={titleId}>{title}</title> : null}

      <circle cx={CX} cy={CY} r={g.rr} fill="none"
        stroke="currentColor" strokeWidth={g.rw} />

      {variant === 'full' ? (
        <g stroke="currentColor" strokeWidth="3.3" strokeLinecap="round">
          {RAYS.map(([x1, y1, x2, y2]) => (
            <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
      ) : null}

      <line x1="59.1" y1="26" x2="59.1" y2="38"
        stroke="currentColor" strokeWidth="3.85" strokeLinecap="round" />

      <g className={faceClassName}>
        <circle cx={CX} cy={CY} r={g.fr} fill="currentColor" />
      </g>

      <g className={inkClassName} fill="none" stroke="currentColor"
        strokeWidth={g.ew} strokeLinecap="round">
        <line x1={CX - g.eo} y1={g.ey1} x2={CX - g.eo} y2={g.ey2} />
        <line x1={CX + g.eo} y1={g.ey1} x2={CX + g.eo} y2={g.ey2} />
        <path d={`M${CX - g.sx} ${g.sy} Q${CX} ${g.sd} ${CX + g.sx} ${g.sy}`} />
      </g>
    </svg>
  )
}
