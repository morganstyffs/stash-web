import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { IconCheck, IconExclamationCircle, IconRefresh } from '@tabler/icons-react'

type ToastKind = 'success' | 'error' | 'info'

/** An optional button rendered inside the toast (e.g. "โหลดใหม่" for updates). */
interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastOptions {
  kind?: ToastKind
  message: string
  /** ms before auto-dismiss; `null` keeps it up until the user acts. */
  duration?: number | null
  action?: ToastAction
}

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  action?: ToastAction
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  /** Full control (kind / action button / persistence). Returns the toast id. */
  show: (opts: ToastOptions) => number
  dismiss: (id: number) => void
}

const DEFAULT_DURATION = 2600

const ToastContext = createContext<ToastApi | null>(null)

/** App-wide toast host. Renders a bottom stack that clears the mobile nav. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    ({ kind = 'success', message, duration = DEFAULT_DURATION, action }: ToastOptions): number => {
      const id = ++seq.current
      setItems((prev) => [...prev, { id, kind, message, action }])
      // Persistent toasts (duration === null) stay until an action dismisses them.
      if (duration !== null) {
        setTimeout(() => dismiss(id), duration)
      }
      return id
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => void show({ kind: 'success', message: m }),
      error: (m) => void show({ kind: 'error', message: m }),
      show,
      dismiss,
    }),
    [show, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex max-w-md items-center gap-2 rounded-pill bg-ink/92 px-4 py-2.5 text-[13px] font-medium text-white shadow-card"
          >
            <ToastIcon kind={t.kind} />
            <span className="min-w-0">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick()
                  dismiss(t.id)
                }}
                className="ml-1 shrink-0 rounded-pill bg-white/20 px-3 py-1 text-[12px] font-medium"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  // income-soft/expense-soft are the locked pair that reads on the dark toast bg
  // (see B14). 'info' is neutral → plain white.
  if (kind === 'success') return <IconCheck size={16} className="shrink-0 text-income-soft" />
  if (kind === 'error')
    return <IconExclamationCircle size={16} className="shrink-0 text-expense-soft" />
  return <IconRefresh size={16} className="shrink-0 text-white" />
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}
