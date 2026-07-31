import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import { ToastProvider } from './components/Toast'
import { PwaUpdater } from './components/PwaUpdater'
import { router } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // staleTime กันไม่ให้สลับแอปไปมาแล้วยิง query รัว (คงไว้ 30s)
      staleTime: 30_000,
      retry: 1,
      // เปิด refetch-on-focus: PWA ที่ค้าง background ครึ่งวันกลับมาแล้วต้องสด
      // ไม่ใช่โชว์ตัวเลขเมื่อวานจนกว่าจะกดเปลี่ยนหน้า
      // เงื่อนไข: useEffect ที่ seed ฟอร์มจาก object ของ query ต้องผูกกับ id
      // ไม่ใช่ object — ไม่งั้น refetch จะรัน effect ซ้ำแล้วทับสิ่งที่ผู้ใช้พิมพ์/อัปโหลดค้าง
      refetchOnWindowFocus: true,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <PwaUpdater />
          <RouterProvider router={router} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
