/**
 * A small pill segmented control — the app's two-or-more mutually-exclusive
 * choice picker (e.g. เดือนนี้ / 3 เดือน). Distinct from MonthSwitcher, which is a
 * ‹ prev/next › stepper over an open-ended sequence; this is a fixed, visible set.
 *
 * Each segment is a ≥44px touch target (matched to the bottom nav / the real-
 * browser guard in AppLayout.visual.test.tsx). Colours + motion come from tokens
 * only; transitions honour motion-reduce.
 */
export interface Segment<T extends string> {
  value: T
  label: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Segment<T>[]
  value: T
  onChange: (v: T) => void
  ariaLabel: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex items-center gap-0.5 rounded-pill bg-fill p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`flex min-h-[44px] flex-1 items-center justify-center rounded-pill px-3 text-[12px] transition-colors duration-150 motion-reduce:transition-none ${
              active ? 'bg-white font-medium text-ink shadow-card' : 'text-muted'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
