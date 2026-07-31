import { useState } from 'react'
import { Overlay } from '@/components/ui'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import { translateError } from '@/lib/errors'
import { useOwnProfile, useSetUsername, useUpdateDisplayName } from '@/hooks/useFriends'
import { isValidUsername, normalizeUsername, USERNAME_RULE_TEXT } from '@/lib/username'

/**
 * โปรไฟล์ — the display name friends see, and the username friends use to add
 * you. Username is SET ONCE (enforced in the DB, 0020): before it's set, an input
 * with an explicit "ตั้งแล้วเปลี่ยนเองไม่ได้" warning + a confirm; after, it's
 * read-only with a note to contact the owner. The old 8-char friend_code is gone
 * from the screen entirely.
 */
export function ProfileManager({ onClose }: { onClose: () => void }) {
  const { data: profile } = useOwnProfile()
  const updateName = useUpdateDisplayName()
  const setUsername = useSetUsername()
  const toast = useToast()
  const [name, setName] = useState<string | null>(null)
  const [uname, setUname] = useState('')
  const [confirming, setConfirming] = useState(false)

  const nameValue = name ?? profile?.display_name ?? ''
  const nameDirty = name !== null && name.trim() !== (profile?.display_name ?? '') && name.trim() !== ''

  async function saveName() {
    try {
      await updateName.mutateAsync(nameValue.trim())
      toast.success('บันทึกชื่อแล้ว')
      setName(null)
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  async function saveUsername() {
    try {
      await setUsername.mutateAsync(uname)
      toast.success('ตั้งชื่อผู้ใช้แล้ว')
      setConfirming(false)
      setUname('')
    } catch (e) {
      // 23505 → "ชื่อผู้ใช้นี้มีคนใช้แล้ว" (thrown in the hook, caught by code);
      // the set-once trigger's Thai message also passes straight through.
      toast.error(translateError(e))
      setConfirming(false)
    }
  }

  return (
    <Overlay title="โปรไฟล์" onClose={onClose}>
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">ชื่อที่แสดง</p>
      <input
        value={nameValue}
        onChange={(e) => setName(e.target.value)}
        placeholder="ชื่อที่เพื่อนเห็น"
        maxLength={40}
        className="w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[15px] outline-none focus:border-brand"
      />
      <p className="mb-4 mt-1.5 text-[11px] leading-relaxed text-faint">
        ชื่อนี้คือชื่อที่เพื่อนของคุณเห็นในหน้ายอดค้าง
      </p>
      <button
        disabled={!nameDirty || updateName.isPending}
        onClick={saveName}
        className="mb-6 w-full rounded-btn bg-brand-deep py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
      >
        บันทึกชื่อ
      </button>

      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">ชื่อผู้ใช้</p>
      {profile?.username ? (
        <>
          <div className="rounded-card border-[0.5px] border-hairline bg-fill px-4 py-3">
            <span className="font-mono text-[18px] font-medium">@{profile.username}</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            เพื่อนใช้ชื่อนี้เพื่อเพิ่มคุณ · เปลี่ยนเองไม่ได้ — ติดต่อผู้ดูแลถ้าตั้งผิด
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center rounded-input border-[0.5px] border-hairline bg-fill pl-3 focus-within:border-brand">
            <span className="text-[15px] text-faint">@</span>
            <input
              value={uname}
              onChange={(e) => setUname(normalizeUsername(e.target.value))}
              placeholder="ชื่อผู้ใช้"
              autoCapitalize="none"
              autoComplete="off"
              maxLength={20}
              className="min-w-0 flex-1 bg-transparent px-1 py-2.5 font-mono text-[15px] outline-none"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-faint">{USERNAME_RULE_TEXT}</p>
          <p className="mt-2 rounded-input bg-warn-bg px-3 py-2 text-[11.5px] leading-relaxed text-warn-ink">
            ⚠️ ตั้งชื่อผู้ใช้แล้ว <span className="font-medium">เปลี่ยนเองไม่ได้</span> — ถ้าตั้งผิดต้องติดต่อผู้ดูแล
          </p>
          <button
            disabled={!isValidUsername(uname) || setUsername.isPending}
            onClick={() => setConfirming(true)}
            className="mt-3 w-full rounded-btn bg-brand-deep py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
          >
            ตั้งชื่อผู้ใช้
          </button>
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title={`ตั้งชื่อผู้ใช้เป็น @${uname} ?`}
          message="ชื่อผู้ใช้เปลี่ยนเองไม่ได้ภายหลัง ตรวจให้แน่ใจก่อนยืนยัน"
          confirmLabel="ยืนยัน"
          busyLabel="กำลังบันทึก…"
          destructive={false}
          busy={setUsername.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={saveUsername}
        />
      )}
    </Overlay>
  )
}
