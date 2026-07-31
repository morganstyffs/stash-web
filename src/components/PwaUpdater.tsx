import { useRegisterSW } from 'virtual:pwa-register/react'
import { useToast } from './Toast'

/**
 * Registers the service worker and surfaces registration failures — nothing more.
 *
 * The SW self-activates (workbox skipWaiting + clientsClaim in vite.config.ts) and
 * the app shell is served network-first, so a new version reaches the user on the
 * next app open with no "โหลดใหม่" tap and no mid-session reload (which is what the
 * old prompt tried, and never fired for the owner across 4 merges). We deliberately
 * do NOT reload the page here, so a half-typed entry is never wiped.
 *
 * Renders nothing; mounted once inside <ToastProvider> (see App.tsx).
 */
export function PwaUpdater() {
  const toast = useToast()

  useRegisterSW({
    onRegisterError(error) {
      // A failed SW registration is otherwise invisible — surface it (convention
      // 17: errors must reach the user, never a silent swallow).
      toast.error('ลงทะเบียนตัวอัปเดตอัตโนมัติไม่สำเร็จ')
      console.error('Service worker registration failed', error)
    },
  })

  return null
}
