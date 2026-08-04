import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { IconArrowLeft, IconSend, IconSparkles } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { useConsent } from '@/hooks/useAiSettings'
import { useToast } from '@/components/Toast'
import { askAssistant, type ChatTurn } from '@/lib/aiChat'
import { translateError } from '@/lib/errors'

/**
 * ผู้ช่วย AI — the chat screen (PR-5). A full-screen route (sibling of /add), so the
 * browser Back button works and the input can pin to the very bottom without a
 * second bottom bar.
 *
 * Load-bearing rules from docs/ai-assistant-design.md §5 / §8, enforced structurally:
 *  • Reachable ONLY with consent = 'on'. A direct-URL visitor whose consent isn't on
 *    is redirected to Settings with a plain-language toast — we never render an
 *    unusable chat that would only 403 (§1).
 *  • History is EPHEMERAL, in memory only (useState) — cleared on reload. Nothing is
 *    written to localStorage or the DB (§8); persistence is a later, undecided PR-6.
 *  • The auth token is read fresh from the live session per send, never cached (§2).
 *  • Every request is real money (~$0.006–0.008) and rate-limited 10/min, so the
 *    send button is disabled while one is in flight and empty input can't send (§2).
 *  • `hideBalance` does NOT apply to chat — the assistant answers real figures always
 *    (§5). This component takes NO props at all, so a `hideBalance` prop can't even be
 *    passed (structural, like SettleSheet / WalletTransferSheet — §11.4-11).
 */

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

// Empty-state examples. They steer the user toward what the assistant can actually
// answer — questions about THEIR OWN money — so a paid request isn't spent on
// something it can only decline. It does NOT answer about ยอดค้าง with friends (§6),
// which the empty-state note says outright. Kept in step with the tools in PR-2b
// (month_spending / home_summary / wallet_balances / stock_sales / stale_stock).
const EXAMPLES = [
  'เดือนที่แล้วจ่ายค่าอาหารไปเท่าไหร่',
  'เดือนนี้รับกับจ่ายไปเท่าไหร่',
  'เงินในกระเป๋าเหลือเท่าไหร่',
  'เดือนที่แล้วขายของได้กำไรเท่าไหร่',
  'ของในสต็อกค้างนานสุดกี่วัน',
]

export function AiPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { session } = useAuth()
  const { data: consent, isLoading: consentLoading } = useConsent()

  // In-memory transcript — deliberately NOT persisted (§8). Reloading the page
  // clears it, which is the intended v1 behaviour.
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Direct-URL visitor without consent 'on' → tell them where to enable it. The
  // redirect itself is the <Navigate> below; this only fires the explanation once
  // the consent state has resolved (not while it's still loading).
  useEffect(() => {
    if (!consentLoading && consent !== 'on') {
      toast.error('เปิดใช้ผู้ช่วย AI ในหน้าตั้งค่าก่อนเริ่มใช้งาน')
    }
  }, [consentLoading, consent, toast])

  // Keep the newest message / the thinking indicator in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pending, error])

  if (consentLoading) {
    return (
      <div className="mx-auto flex h-full max-w-md items-center justify-center bg-white">
        <p className="text-[13px] text-faint">กำลังโหลด…</p>
      </div>
    )
  }
  // Fail closed: not enabled → go to Settings (the toast above explains why),
  // never show the chat.
  if (consent !== 'on') {
    return <Navigate to="/settings" replace />
  }

  const canSend = input.trim().length > 0 && !pending

  async function send() {
    const question = input.trim()
    // Double-send guard (§2): never fire while a request is in flight or the box is
    // empty. The disabled button is the visual half of this; this is the real gate.
    if (!question || pending) return
    // Fresh token from the live session — never cached by us (§2). Under RequireAuth
    // a session always exists; the empty fallback just lets the Worker answer 401
    // with its own Thai line instead of us inventing one.
    const token = session?.access_token ?? ''

    // Snapshot the transcript AS OF this send — the render-closure `messages`,
    // i.e. everything BEFORE this question is optimistically appended below. Read
    // from the closure (NOT a setter callback) so it's the pre-append history. A
    // failed earlier question can leave a trailing `user` here, which the Worker's
    // sanitizeHistory is built to handle. Still ephemeral: nothing is persisted.
    //
    // DELIBERATELY map field-by-field into `ChatTurn`, do NOT pass `messages`
    // through. The Worker (worker/history.ts) is an ALLOWLIST that accepts ONLY
    // `{ role, text }` and 400s on any extra key. So a field added to
    // `ChatMessage` later (e.g. the deep-link data AI-J will attach to assistant
    // turns) must NOT leak onto the wire automatically. The `: ChatTurn[]`
    // annotation is the real guard: TypeScript's excess-property check fails the
    // build the moment an extra field is spread into this literal.
    const history: ChatTurn[] = messages.map(({ role, text }) => ({ role, text }))

    setMessages((m) => [...m, { role: 'user', text: question }])
    setInput('')
    setError(null)
    setPending(true)
    try {
      const reply = await askAssistant(question, token, history)
      setMessages((m) => [...m, { role: 'assistant', text: reply }])
    } catch (e) {
      // Error must reach the user (convention 15) — mapped by errors.ts, keyed on
      // status, with the Worker's Thai passed through. The question stays in the
      // transcript so the user sees what failed.
      setError(translateError(e))
    } finally {
      setPending(false)
    }
  }

  const isEmpty = messages.length === 0 && !pending && !error

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-white">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b-[0.5px] border-hairline px-[14px] pb-3 pt-4">
        <button
          aria-label="ย้อนกลับ"
          onClick={() => navigate(-1)}
          className="-m-2 flex h-10 w-10 items-center justify-center"
        >
          <IconArrowLeft size={20} className="text-muted" />
        </button>
        <span className="flex items-center gap-1.5">
          <IconSparkles size={18} className="text-brand-deep" />
          <p className="text-[16px] font-medium">ผู้ช่วย AI</p>
        </span>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {isEmpty ? (
          <div className="mx-auto max-w-sm pt-6">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[14px] bg-brand-tint">
              <IconSparkles size={22} className="text-brand-deep" />
            </div>
            <p className="text-[15px] font-medium">ถามเรื่องเงินของคุณได้เลย</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
              ผู้ช่วยตอบได้เฉพาะข้อมูลการเงินของคุณเอง เช่น
            </p>
            <div className="mt-2.5 flex flex-col gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2 text-left text-[12.5px] text-brand-ink"
                >
                  {ex}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
              ยังไม่ตอบเรื่องยอดค้างกับเพื่อน — ตอบเฉพาะเรื่องเงินของคุณเอง
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} text={m.text} />
            ))}
            {pending && (
              <div className="self-start rounded-[16px] rounded-bl-[4px] bg-fill px-3.5 py-2.5">
                <p className="text-[13px] text-muted">กำลังคิด… อาจใช้เวลาสักครู่</p>
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="self-start rounded-[12px] bg-expense-bg px-3 py-2 text-[12.5px] leading-relaxed text-expense"
              >
                {error}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t-[0.5px] border-hairline px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter makes a newline.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            rows={1}
            placeholder="พิมพ์คำถามเรื่องเงินของคุณ"
            aria-label="พิมพ์คำถาม"
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-input border-[0.5px] border-hairline bg-fill px-3 py-3 text-[13px] outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="ส่งคำถาม"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-brand-deep text-white disabled:opacity-40"
          >
            <IconSend size={20} />
          </button>
        </form>
      </div>
    </div>
  )
}

/**
 * Render `**bold**` spans as real <strong>, everything else as plain text.
 *
 * We support ONLY paired `**…**` (the one markdown the assistant is allowed to
 * emit — see SYSTEM_PROMPT). Any other markdown (#, |, ```, []()) and a lone or
 * unmatched `**` are left as literal characters ON PURPOSE: seeing raw syntax on
 * screen is the visible signal that the prompt was violated. We build React nodes
 * (never dangerouslySetInnerHTML): the text is model output that can echo what the
 * user typed, so turning it into raw HTML would open XSS for no benefit.
 */
function renderBold(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /\*\*(.+?)\*\*/g // non-greedy; `.` excludes newlines, so bold never spans lines
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    nodes.push(<strong key={key++}>{m[1]}</strong>)
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** One chat bubble. User messages sit on the right in brand tint; assistant replies
 *  on the left in the neutral fill. Always shows the real text (no hideBalance).
 *  `**bold**` renders as <strong>; whitespace-pre-wrap keeps the assistant's newlines. */
function Bubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const mine = role === 'user'
  return (
    <div
      className={`max-w-[85%] whitespace-pre-wrap px-3.5 py-2.5 text-[13px] leading-relaxed ${
        mine
          ? 'self-end rounded-[16px] rounded-br-[4px] bg-brand-tint text-brand-ink'
          : 'self-start rounded-[16px] rounded-bl-[4px] bg-fill text-ink'
      }`}
    >
      {renderBold(text)}
    </div>
  )
}
