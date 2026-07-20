import type { ReactNode } from 'react'
import { IconArrowLeft } from '@tabler/icons-react'

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

/** Full-screen sheet with a back header — used for settings sub-managers. */
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
    <div className="fixed inset-0 z-40 flex flex-col bg-surface">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col bg-white">
        <div className="flex items-center justify-between px-[18px] pb-3 pt-4">
          <button aria-label="ย้อนกลับ" onClick={onClose}>
            <IconArrowLeft size={20} className="text-muted" />
          </button>
          <p className="text-[16px] font-medium">{title}</p>
          <span className="flex min-w-[20px] justify-end">{action}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-8">{children}</div>
      </div>
    </div>
  )
}
