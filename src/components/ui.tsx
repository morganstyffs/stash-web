import type { ReactNode } from 'react'
import { IconX } from '@tabler/icons-react'

/** Mint pill toggle matching the settings mockup. */
export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-pill transition-colors ${
        on ? 'bg-mint-deep' : 'bg-chevron'
      }`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all ${
          on ? 'right-[3px]' : 'left-[3px]'
        }`}
      />
    </button>
  )
}

/**
 * Bottom-sheet container — the app's single modal pattern. Slides up from the
 * bottom, closes on the X or a backdrop tap, and scrolls internally. On tablet/
 * desktop it centres as a card. Used for the settings sub-managers.
 */
export function Overlay({
  title,
  onClose,
  children,
  action,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-[22px] bg-white sm:rounded-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
          <p className="text-[16px] font-medium">{title}</p>
          <span className="flex items-center gap-2">
            {action}
            <button aria-label="ปิด" onClick={onClose}>
              <IconX size={20} className="text-muted" />
            </button>
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-6">{children}</div>
      </div>
    </div>
  )
}
