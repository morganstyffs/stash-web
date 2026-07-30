import type { ReactNode } from 'react'
import type { Icon as TablerIcon } from '@tabler/icons-react'
import { LedgerIcon } from '@/components/LedgerIcon'

/**
 * One ledger row: a box-less category-coloured icon, a title + sub-line, and a
 * right-hand figure. Shared by the Home tabs (รายการล่าสุด and รอจ่าย) so the two
 * lists are visibly the same row, not two look-alikes that can drift apart
 * (convention 3). Presentational only — every caller decides its own icon,
 * colour, copy, right-hand node, and whether the row is a button.
 *
 * `onClick` omitted → a non-interactive <div> (the รอจ่าย rows aren't tappable in
 * v1). `muted` dims the whole row for entries that haven't happened yet, so
 * "pending" never rests on colour alone (paired with an explicit cue in the
 * sub-line at the call site).
 */
export function LedgerRow({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  onClick,
  last = false,
  muted = false,
}: {
  icon: TablerIcon
  iconColor: string
  title: string
  subtitle: ReactNode
  right: ReactNode
  onClick?: () => void
  last?: boolean
  muted?: boolean
}) {
  const className = `flex w-full items-center gap-[11px] py-2.5 text-left${
    last ? '' : ' border-b-[0.5px] border-hairline'
  }${muted ? ' opacity-60' : ''}`
  const body = (
    <>
      <LedgerIcon icon={icon} color={iconColor} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px]">{title}</p>
        <p className="mt-px text-[11px] text-faint">{subtitle}</p>
      </div>
      {right}
    </>
  )
  return onClick ? (
    <button onClick={onClick} className={className}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  )
}
