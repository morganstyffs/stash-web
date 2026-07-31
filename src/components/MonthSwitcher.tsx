import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { monthAnchorFromKey } from '@/lib/dates'
import { formatMonthShort } from '@/lib/format'

/**
 * Month stepper that replaces the static "ยินดีต้อนรับกลับ" header text: ‹ ก.ค. 2569 ›.
 * The next arrow is DISABLED (not hidden) on the current month so the ‹ arrow and
 * the label don't shift when you reach today, and so a future month can't be
 * reached. Each arrow is a ≥44px touch target (matched to the bottom nav), pulled
 * back with a negative margin so the 44px hit area doesn't grow the header row.
 *
 * Shared by the home and budget screens (convention 10) — one stepper, so the two
 * pages step months identically.
 */
export function MonthSwitcher({
  month,
  isCurrent,
  onPrev,
  onNext,
}: {
  month: string
  isCurrent: boolean
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={onPrev}
        aria-label="ดูเดือนก่อนหน้า"
        className="-my-[7px] flex h-11 w-11 items-center justify-center text-muted active:text-ink"
      >
        <IconChevronLeft size={20} />
      </button>
      <span
        aria-live="polite"
        className="min-w-[84px] text-center text-[15px] font-medium tabular-nums"
      >
        {formatMonthShort(monthAnchorFromKey(month))}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={isCurrent}
        aria-label="ดูเดือนถัดไป"
        className="-my-[7px] flex h-11 w-11 items-center justify-center text-muted active:text-ink disabled:opacity-30"
      >
        <IconChevronRight size={20} />
      </button>
    </div>
  )
}
