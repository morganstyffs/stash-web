import { useNavigate } from 'react-router-dom'
import { IconArrowLeft } from '@tabler/icons-react'

/**
 * Temporary placeholder for screens built in the next deliverable (part 3).
 * Establishes the header + brand shell so routing/nav can be exercised now.
 */
export function ScreenPlaceholder({
  title,
  note,
  back,
}: {
  title: string
  note?: string
  back?: boolean
}) {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-3 px-[18px] pb-3 pt-[18px]">
        {back && (
          <button aria-label="ย้อนกลับ" onClick={() => navigate(-1)}>
            <IconArrowLeft size={20} className="text-muted" />
          </button>
        )}
        <p className="text-[17px] font-medium">{title}</p>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
        <p className="max-w-xs text-[13px] leading-relaxed text-faint">
          {note ?? 'หน้าจอนี้จะสร้างแบบ pixel-perfect ในขั้นตอนถัดไป (ส่วนที่ 3)'}
        </p>
      </div>
    </div>
  )
}
