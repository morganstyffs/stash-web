import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useToast } from './Toast'

/**
 * Wires the service worker's update flow (registerType: 'prompt' in
 * vite.config.ts) to the app. When a new version is waiting we do NOT reload
 * silently — the owner might be mid-entry — instead we raise a persistent Toast
 * with a "โหลดใหม่" button and let them choose when to reload.
 *
 * Renders nothing; mounted once inside <ToastProvider> (see App.tsx).
 */
export function PwaUpdater() {
  const toast = useToast()
  const shownRef = useRef(false)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      // A failed SW registration is otherwise invisible — surface it (convention
      // 17: errors must reach the user, never a silent swallow).
      toast.error('ลงทะเบียนตัวอัปเดตอัตโนมัติไม่สำเร็จ')
      console.error('Service worker registration failed', error)
    },
  })

  useEffect(() => {
    if (!needRefresh || shownRef.current) return
    shownRef.current = true // one prompt per waiting version, not one per render
    toast.show({
      kind: 'info',
      message: 'มีเวอร์ชันใหม่พร้อมใช้งาน',
      duration: null, // stay until the owner taps โหลดใหม่
      action: {
        label: 'โหลดใหม่',
        onClick: () => {
          // Activates the waiting SW and reloads the page.
          void updateServiceWorker(true)
        },
      },
    })
  }, [needRefresh, toast, updateServiceWorker])

  return null
}
