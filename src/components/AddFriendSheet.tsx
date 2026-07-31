import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconCheck, IconUserPlus, IconX } from '@tabler/icons-react'
import { Overlay } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { translateError } from '@/lib/errors'
import { normalizeUsername } from '@/lib/username'
import {
  useFriendRequests,
  useOwnProfile,
  useRespondFriendRequest,
  useSendFriendRequest,
  type PendingRequest,
} from '@/hooks/useFriends'

/**
 * เพิ่มเพื่อน — add by username (found by a name the owner chose, never by email;
 * convention 16). A pending request now shows the other person's display name +
 * @username on both sides, because 0020 widened the profiles policy to reveal a
 * counterpart on any connection row. If you haven't set your own username, a
 * friend can't find you — that's called out here with a shortcut to set it.
 */
export function AddFriendSheet({ onClose }: { onClose: () => void }) {
  const { data: profile } = useOwnProfile()
  const { data: requests } = useFriendRequests()
  const send = useSendFriendRequest()
  const respond = useRespondFriendRequest()
  const toast = useToast()
  const navigate = useNavigate()
  const [uname, setUname] = useState('')

  async function sendRequest() {
    try {
      await send.mutateAsync(uname)
      toast.success('ส่งคำขอแล้ว')
      setUname('')
    } catch (e) {
      // friend_request_send returns ready-to-read Thai (ไม่พบผู้ใช้นี้, …);
      // translateError passes it through — no substring matching (rule 14).
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

  function goSetUsername() {
    onClose()
    navigate('/settings', { state: { openManager: 'profile' } })
  }

  const incoming = requests?.incoming ?? []
  const outgoing = requests?.outgoing ?? []

  return (
    <Overlay title="เพิ่มเพื่อน" onClose={onClose}>
      {/* your username (or a nudge to set one) */}
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">ชื่อผู้ใช้ของคุณ</p>
      {profile?.username ? (
        <>
          <div className="mb-1.5 rounded-card border-[0.5px] border-hairline bg-fill px-4 py-3">
            <span className="font-mono text-[18px] font-medium">@{profile.username}</span>
          </div>
          <p className="mb-5 text-[11px] leading-relaxed text-faint">บอกชื่อนี้ให้เพื่อนเพื่อให้เขาเพิ่มคุณ</p>
        </>
      ) : (
        <button
          type="button"
          onClick={goSetUsername}
          className="mb-5 w-full rounded-card border-[0.5px] border-warn bg-warn-bg px-4 py-3 text-left"
        >
          <p className="text-[13px] font-medium text-warn-ink">คุณยังไม่ได้ตั้งชื่อผู้ใช้</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-warn-ink">
            เพื่อนจะค้นหาและเพิ่มคุณไม่ได้จนกว่าจะตั้ง — แตะเพื่อตั้งเลย
          </p>
        </button>
      )}

      {/* send a request by username */}
      <p className="mb-1.5 text-[11px] uppercase tracking-[0.5px] text-faint">เพิ่มด้วยชื่อผู้ใช้</p>
      <div className="mb-6 flex gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-input border-[0.5px] border-hairline bg-fill pl-3 focus-within:border-brand">
          <span className="text-[15px] text-faint">@</span>
          <input
            value={uname}
            onChange={(e) => setUname(normalizeUsername(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && uname && !send.isPending) sendRequest()
            }}
            placeholder="ชื่อผู้ใช้เพื่อน"
            autoCapitalize="none"
            autoComplete="off"
            maxLength={20}
            className="min-w-0 flex-1 bg-transparent px-1 py-2.5 font-mono text-[15px] outline-none"
          />
        </div>
        <button
          disabled={!uname || send.isPending}
          onClick={sendRequest}
          className="flex shrink-0 items-center gap-1.5 rounded-btn bg-brand-deep px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
        >
          <IconUserPlus size={16} />
          ส่ง
        </button>
      </div>

      {/* incoming — now with identity, so you can decide */}
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
                <RequesterIdentity req={r} className="min-w-0 flex-1" />
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

      {/* outgoing — awaiting their answer, also named */}
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
                <RequesterIdentity req={r} className="min-w-0 flex-1" />
                <span className="shrink-0 text-[11px] text-faint">รอตอบรับ</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Overlay>
  )
}

/** Display name + @username of the other party; falls back gracefully if the
 *  profile couldn't be read. */
function RequesterIdentity({ req, className }: { req: PendingRequest; className?: string }) {
  return (
    <div className={className}>
      <p className="truncate text-[13.5px]">{req.displayName ?? 'เพื่อน'}</p>
      {req.username && <p className="truncate font-mono text-[11px] text-faint">@{req.username}</p>}
    </div>
  )
}
