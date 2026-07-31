import { useState } from 'react'
import { IconCheck, IconCopy, IconUserPlus, IconX } from '@tabler/icons-react'
import { Overlay } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { translateError } from '@/lib/errors'
import {
  useFriendRequests,
  useOwnProfile,
  useRespondFriendRequest,
  useSendFriendRequest,
} from '@/hooks/useFriends'

/**
 * เพิ่มเพื่อน — share your own friend code, send a request by someone else's, and
 * answer pending requests. Friends are found by an unguessable 8-char code, never
 * by email (convention 16). A pending request shows NO name on either side: until
 * it's accepted, profiles RLS won't reveal the other person's identity (0015 §3),
 * which is also the "don't reveal the code owner before they accept" rule.
 */
export function AddFriendSheet({ onClose }: { onClose: () => void }) {
  const { data: profile } = useOwnProfile()
  const { data: requests } = useFriendRequests()
  const send = useSendFriendRequest()
  const respond = useRespondFriendRequest()
  const toast = useToast()
  const [code, setCode] = useState('')

  async function copyCode() {
    if (!profile?.friend_code) return
    try {
      await navigator.clipboard.writeText(profile.friend_code)
      toast.success('คัดลอกรหัสแล้ว')
    } catch {
      toast.error('คัดลอกไม่สำเร็จ')
    }
  }

  async function sendRequest() {
    try {
      await send.mutateAsync(code.trim().toUpperCase())
      toast.success('ส่งคำขอแล้ว')
      setCode('')
    } catch (e) {
      // friend_request_send returns ready-to-read Thai (ไม่พบรหัสเพื่อนนี้, …);
      // translateError passes it through — no substring matching here (rule 14).
      toast.error(translateError(e))
    }
  }

  async function answer(id: string, accept: boolean) {
    try {
      await respond.mutateAsync({ id, accept })
      toast.success(accept ? 'เป็นเพื่อนกันแล้ว' : 'ปฏิเสธคำขอแล้ว')
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  const incoming = requests?.incoming ?? []
  const outgoing = requests?.outgoing ?? []

  return (
    <Overlay title="เพิ่มเพื่อน" onClose={onClose}>
      {/* my code */}
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">รหัสเพื่อนของคุณ</p>
      <button
        type="button"
        onClick={copyCode}
        aria-label="คัดลอกรหัสเพื่อน"
        className="mb-1.5 flex w-full items-center justify-between gap-3 rounded-card border-[0.5px] border-hairline bg-fill px-4 py-3 text-left"
      >
        <span className="font-mono text-[22px] font-medium tracking-[0.18em]">
          {profile?.friend_code ?? '••••••••'}
        </span>
        <IconCopy size={18} className="shrink-0 text-brand-deep" />
      </button>
      <p className="mb-5 text-[11px] leading-relaxed text-faint">
        ส่งรหัสนี้ให้เพื่อนที่มีบัญชี Stash เพื่อให้เขาเพิ่มคุณ
      </p>

      {/* send a request */}
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">กรอกรหัสเพื่อน</p>
      <div className="mb-6 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && code.trim() && !send.isPending) sendRequest()
          }}
          placeholder="เช่น K7P2M9QX"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={8}
          className="min-w-0 flex-1 rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 font-mono text-[15px] tracking-[0.12em] outline-none focus:border-brand"
        />
        <button
          disabled={!code.trim() || send.isPending}
          onClick={sendRequest}
          className="flex shrink-0 items-center gap-1.5 rounded-btn bg-brand-deep px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
        >
          <IconUserPlus size={16} />
          ส่ง
        </button>
      </div>

      {/* incoming — accept / decline */}
      {incoming.length > 0 && (
        <>
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">
            คำขอเป็นเพื่อน ({incoming.length})
          </p>
          <div className="mb-5">
            {incoming.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 border-b-[0.5px] border-hairline py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px]">มีคนขอเพิ่มคุณเป็นเพื่อน</p>
                  <p className="text-[11px] text-faint">ชื่อจะแสดงเมื่อคุณกดรับ</p>
                </div>
                <button
                  aria-label="รับคำขอ"
                  disabled={respond.isPending}
                  onClick={() => answer(r.id, true)}
                  className="flex h-11 items-center gap-1 rounded-btn bg-brand-deep px-3 text-[12px] font-medium text-white disabled:opacity-40"
                >
                  <IconCheck size={15} />
                  รับ
                </button>
                <button
                  aria-label="ปฏิเสธคำขอ"
                  disabled={respond.isPending}
                  onClick={() => answer(r.id, false)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-fill disabled:opacity-40"
                >
                  <IconX size={16} className="text-faint" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* outgoing — awaiting their answer */}
      {outgoing.length > 0 && (
        <>
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">
            รอตอบรับ ({outgoing.length})
          </p>
          <div>
            {outgoing.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 border-b-[0.5px] border-hairline py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-muted">ส่งคำขอแล้ว</p>
                  <p className="text-[11px] text-faint">รอเพื่อนกดรับ</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Overlay>
  )
}
