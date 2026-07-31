import { useState } from 'react'
import { IconCopy } from '@tabler/icons-react'
import { Overlay } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { translateError } from '@/lib/errors'
import { useOwnProfile, useUpdateDisplayName } from '@/hooks/useFriends'

/**
 * โปรไฟล์ — edit the display name friends see, and read (copy) your own friend
 * code. The default name is the email's local part (0015 seed), which often reads
 * oddly, so this exists from the very first ยอดค้าง PR. friend_code is read-only:
 * there is no RPC to regenerate it, so there is deliberately no button that would
 * do nothing (convention 17 spirit — no dead affordance).
 */
export function ProfileManager({ onClose }: { onClose: () => void }) {
  const { data: profile } = useOwnProfile()
  const update = useUpdateDisplayName()
  const toast = useToast()
  const [name, setName] = useState<string | null>(null)

  // Controlled from the loaded profile until the user edits (then local state).
  const value = name ?? profile?.display_name ?? ''
  const dirty = name !== null && name.trim() !== (profile?.display_name ?? '') && name.trim() !== ''

  async function save() {
    try {
      await update.mutateAsync(value.trim())
      toast.success('บันทึกชื่อแล้ว')
      setName(null)
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  async function copyCode() {
    if (!profile?.friend_code) return
    try {
      await navigator.clipboard.writeText(profile.friend_code)
      toast.success('คัดลอกรหัสแล้ว')
    } catch {
      toast.error('คัดลอกไม่สำเร็จ')
    }
  }

  return (
    <Overlay title="โปรไฟล์" onClose={onClose}>
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">ชื่อที่แสดง</p>
      <input
        value={value}
        onChange={(e) => setName(e.target.value)}
        placeholder="ชื่อที่เพื่อนเห็น"
        maxLength={40}
        className="w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[15px] outline-none focus:border-brand"
      />
      <p className="mb-4 mt-1.5 text-[11px] leading-relaxed text-faint">
        ชื่อนี้คือชื่อที่เพื่อนของคุณเห็นในหน้ายอดค้าง
      </p>
      <button
        disabled={!dirty || update.isPending}
        onClick={save}
        className="mb-6 w-full rounded-btn bg-brand-deep py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
      >
        บันทึกชื่อ
      </button>

      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">รหัสเพื่อน</p>
      <button
        type="button"
        onClick={copyCode}
        aria-label="คัดลอกรหัสเพื่อน"
        className="flex w-full items-center justify-between gap-3 rounded-card border-[0.5px] border-hairline bg-fill px-4 py-3 text-left"
      >
        <span className="font-mono text-[20px] font-medium tracking-[0.18em]">
          {profile?.friend_code ?? '••••••••'}
        </span>
        <IconCopy size={18} className="shrink-0 text-brand-deep" />
      </button>
      <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
        ส่งรหัสนี้ให้เพื่อนเพื่อให้เขาเพิ่มคุณ — รหัสนี้เปลี่ยนไม่ได้
      </p>
    </Overlay>
  )
}
