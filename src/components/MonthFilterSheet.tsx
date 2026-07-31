import { IconCheck } from '@tabler/icons-react'
import { Overlay } from '@/components/ui'
import { monthAnchorFromKey, recentMonthKeys } from '@/lib/dates'
import { formatMonthShort } from '@/lib/format'

/**
 * เลือกเดือน — the history page's month picker, as a bottom sheet (the app's one
 * modal pattern, via Overlay) rather than a native month input, which iOS/Safari
 * renders as an empty text field — so the app owns the UI. Offers "ทุกเดือน" ('' = no
 * filter, the default) plus a fixed 12-month lookback from recentMonthKeys (the
 * single source of that list — convention 10). The active choice shows a check so
 * "which month am I looking at" is unambiguous. Each option is a ≥44px touch row.
 */
export function MonthFilterSheet({
  month,
  onSelect,
  onClose,
}: {
  /** the currently-applied filter: '' = every month, else 'YYYY-MM' */
  month: string
  onSelect: (month: string) => void
  onClose: () => void
}) {
  // '' first (the default "every month"), then this month and the 11 before it.
  const options: { key: string; label: string }[] = [
    { key: '', label: 'ทุกเดือน' },
    ...recentMonthKeys().map((k) => ({ key: k, label: formatMonthShort(monthAnchorFromKey(k)) })),
  ]

  return (
    <Overlay title="เลือกเดือน" onClose={onClose}>
      <div className="flex flex-col">
        {options.map((o) => {
          const active = o.key === month
          return (
            <button
              key={o.key || 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => {
                onSelect(o.key)
                onClose()
              }}
              className="flex min-h-[44px] items-center justify-between border-b-[0.5px] border-hairline text-left last:border-b-0"
            >
              <span className={`text-[14px] ${active ? 'font-medium text-brand-ink' : 'text-ink'}`}>
                {o.label}
              </span>
              {active && <IconCheck size={18} className="shrink-0 text-brand-deep" aria-hidden />}
            </button>
          )
        })}
      </div>
    </Overlay>
  )
}
