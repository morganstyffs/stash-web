/**
 * Small confirm bottom-sheet for destructive actions. Sits at z-50 so it stacks
 * above the manager overlays (z-40). Buttons disable while `busy`.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'ลบ',
  busyLabel = 'กำลังลบ…',
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string
  message?: string
  confirmLabel?: string
  busyLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-t-[22px] bg-white p-5 sm:rounded-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[15px] font-medium">{title}</p>
        {message && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{message}</p>}
        <div className="mt-4 flex gap-2.5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-btn border-[0.5px] border-hairline py-3 text-[14px] font-medium disabled:opacity-40"
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 rounded-btn py-3 text-[14px] font-medium text-white disabled:opacity-40 ${
              destructive ? 'bg-expense' : 'bg-brand-deep'
            }`}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
