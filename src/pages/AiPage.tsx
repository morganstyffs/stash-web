import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { IconArrowLeft, IconSend, IconSparkles, IconTrash } from '@tabler/icons-react'
import { useAuth } from '@/hooks/useAuth'
import { useConsent } from '@/hooks/useAiSettings'
import { useToast } from '@/components/Toast'
import { askAssistant, type ChatTurn } from '@/lib/aiChat'
import { AI_MAX_QUESTION_CHARS } from '@/lib/aiLimits'
import { translateError } from '@/lib/errors'
import {
  clearChatHistory,
  loadChatHistory,
  loadHideBalance,
  saveChatHistory,
} from '@/lib/prefs'

/**
 * ผู้ช่วย AI — the chat screen (PR-5). A full-screen route (sibling of /add), so the
 * browser Back button works and the input can pin to the very bottom without a
 * second bottom bar.
 *
 * Load-bearing rules from docs/ai-assistant-design.md §5 / §8, enforced structurally:
 *  • Reachable ONLY with consent = 'on'. A direct-URL visitor whose consent isn't on
 *    is redirected to Settings with a plain-language toast — we never render an
 *    unusable chat that would only 403 (§1).
 *  • History PERSISTS across reloads via localStorage (task 7), owned by prefs.ts
 *    (the one file that touches `stash.*`) — but ONLY while consent = 'on'; nothing is
 *    written without it, and it is wiped on sign-out / consent-off / the clear button.
 *    Still just `{ role, text }` — never the DB (chat history is convenience, not a
 *    security store; see prefs.ts for why).
 *  • The auth token is read fresh from the live session per send, never cached (§2).
 *  • Every request is real money (~$0.006–0.008) and rate-limited 10/min, so the
 *    send button is disabled while one is in flight and empty input can't send (§2).
 *  • `hideBalance` masks ONLY the turns RELOADED from storage — arriving to a screen
 *    full of old figures is a full glance the user didn't ask for, so those bubbles
 *    come back covered and reveal one-by-one on tap (§11.4-11 "hide on a glance, show
 *    on a decision"). Turns from the CURRENT round (just asked) are never masked — the
 *    user just chose to ask them. The flag is READ from prefs.ts (like every other
 *    screen); this component still takes NO props at all, so a `hideBalance` prop
 *    can't even be passed (structural, like SettleSheet / WalletTransferSheet).
 */

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  // True for a turn RELOADED from storage on mount (task 7). Purely a render hint —
  // it decides whether hideBalance masks the bubble — and is NEVER stored or sent:
  // saveChatHistory and send()'s history map both re-project to `{ role, text }`, and
  // the `: ChatTurn[]` annotation in send() fails the build if it ever tried to leak.
  persisted?: boolean
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
  const [searchParams] = useSearchParams()
  const toast = useToast()
  const { session } = useAuth()
  const { data: consent, isLoading: consentLoading } = useConsent()

  // The transcript. Seeded from localStorage after consent resolves (task 7) and
  // written back on every change — see the two effects below.
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // Whether the saved transcript has been read yet. A state flag, NOT a ref, on
  // purpose: it must re-run the save effect once loading finishes, so the save effect
  // can bail while it's false and never clobber stored history with the empty mount
  // value before the load has had its turn.
  const [loaded, setLoaded] = useState(false)
  // hideBalance read ONCE at mount from prefs.ts (the same read-once pattern as
  // useHideBalance), so navigating in re-reads whatever the eye was last set to. AiPage
  // shows no eye of its own — it only OBEYS the setting when masking reloaded turns.
  const [hideBalance] = useState(loadHideBalance)
  // Deep-link prefill: another screen can send the user here with a question ready
  // to send via /ai?q=… (the ถาม AI buttons on the budget / stock screens). We seed
  // the composer ONCE at mount and STOP — we never call send() for it. Every request
  // is real money and quota, so a page open / refresh / back-forward must not fire a
  // paid request the user didn't press for; the user still taps ส่ง themselves. `q`
  // is untrusted URL input, so it's clamped to AI_MAX_QUESTION_CHARS (the Worker's
  // own limit) — an over-long link is truncated, never allowed to break the page.
  // No `q` → '' → the empty state (examples + note) is byte-for-byte unchanged.
  const [input, setInput] = useState(() =>
    (searchParams.get('q') ?? '').slice(0, AI_MAX_QUESTION_CHARS),
  )
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

  // Load the saved transcript ONCE, and only after consent has resolved to 'on' —
  // reading (like writing) is gated on consent so a session that never consented
  // shows nothing. Reloaded turns are tagged `persisted` so hideBalance can mask
  // them; an empty / corrupt store just leaves the empty state (loadChatHistory
  // never throws). Setting `loaded` last is what releases the save effect below.
  useEffect(() => {
    if (loaded || consentLoading || consent !== 'on') return
    const saved = loadChatHistory()
    if (saved.length) setMessages(saved.map((m) => ({ ...m, persisted: true })))
    setLoaded(true)
  }, [loaded, consentLoading, consent])

  // Write the transcript back whenever it changes. Gated three ways: only after the
  // load has run (`loaded` — so the empty mount value can't overwrite real history),
  // and only with consent 'on' (no consent → nothing is ever written; §"ห้ามเก็บ
  // เมื่อยังไม่ยินยอม"). saveChatHistory itself re-projects to `{ role, text }` and
  // caps the length, so `persisted` never reaches disk and the store can't grow
  // unbounded. Clearing (button / send-nothing) writes `[]`, which is the point.
  useEffect(() => {
    if (!loaded || consent !== 'on') return
    saveChatHistory(messages)
  }, [messages, loaded, consent])

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
    // sanitizeHistory is built to handle. Persistence (task 7) is a SEPARATE concern
    // handled by the save effect — the wire snapshot here is unchanged by it.
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

  // Clear the conversation — from the screen AND from storage. The user must always
  // be able to delete their own history (task 7); the trash button in the header is
  // the visible half. Wipe the store directly here too (not only via the save effect)
  // so the intent is explicit and doesn't ride on effect timing.
  function clearHistory() {
    setMessages([])
    setError(null)
    clearChatHistory()
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
        {/* Clear the whole conversation. Shown only when there's something to clear,
            pinned right so it never crowds the title. The user must always be able to
            delete their own saved history (task 7). */}
        {messages.length > 0 && (
          <button
            aria-label="ล้างประวัติแชท"
            onClick={clearHistory}
            className="-m-2 ml-auto flex h-10 w-10 items-center justify-center"
          >
            <IconTrash size={19} className="text-muted" />
          </button>
        )}
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
              // Mask ONLY reloaded turns, and only under hideBalance — a current-round
              // turn the user just asked is never covered (task 7 / §11.4-11).
              <Bubble
                key={i}
                role={m.role}
                text={m.text}
                maskable={hideBalance && m.persisted === true}
              />
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

/**
 * Screens the assistant is allowed to deep-link into (§ AI-5a), mapped to the
 * human label its button shows. An ALLOWLIST, never a denylist: the path arrives
 * INSIDE the model's text, which can echo whatever the user typed, so only an
 * exact known route ever becomes a button. The label is read from HERE, never
 * from the model — so no user/model text is ever reflected onto the control.
 * The query string rides along untouched; HistoryPage validates ?m/?cat/?filter
 * itself, degrading a bad value to "no filter" there.
 */
const LINK_ROUTES: Record<string, string> = {
  '/history': 'ดูรายการทั้งหมด',
}

/** The one-line marker the model appends when a tool result carried a `link`
 *  (see the Worker SYSTEM_PROMPT). Whole-line match; group 1 is the raw path. */
const LINK_LINE_RE = /^\s*\{\{link:(\S+)\}\}\s*$/

interface AssistantLink {
  path: string
  label: string
}

/**
 * A model-supplied path → a button descriptor, or null when it is not a known,
 * root-relative, in-app route. The threat model: `raw` is model text and can
 * reflect the user's input, so it is NEVER handed to navigate() unchecked. It
 * must be root-relative ('/…') and NOT protocol-relative ('//host', which the URL
 * parser reads as another origin → off-site), and its pathname must be an exact
 * key of LINK_ROUTES.
 */
function validateLinkPath(raw: string): AssistantLink | null {
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  let pathname: string
  try {
    // Throwaway origin, only to split path from query safely. `raw` already
    // starts with a single '/', so this base can't be overridden (no scheme, no
    // '//host'); '/a/../settings'-style tricks normalise and then fail the map.
    pathname = new URL(raw, 'http://localhost').pathname
  } catch {
    return null
  }
  const label = LINK_ROUTES[pathname]
  return label ? { path: raw, label } : null
}

/**
 * Split an assistant message into its spoken text and an optional deep-link
 * button. The marker (if any) is the last non-empty line; it is removed from the
 * body ONLY when it holds a known, well-formed path. A marker that is malformed
 * OR points outside the allowlist is left in the body as raw text — never
 * silently dropped (the visible raw syntax is the signal the contract was
 * broken, same stance as renderBold) and never turned into a button.
 */
function parseAssistantMessage(text: string): { body: string; link: AssistantLink | null } {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '') continue // skip trailing blank lines
    const m = LINK_LINE_RE.exec(lines[i])
    if (!m) break // last non-empty line isn't a marker → nothing to extract
    const link = validateLinkPath(m[1])
    if (!link) break // malformed / disallowed → leave the line as raw text
    lines.splice(i, 1)
    return { body: lines.join('\n').trimEnd(), link }
  }
  return { body: text, link: null }
}

/** One chat bubble. User messages sit on the right in brand tint; assistant replies
 *  on the left in the neutral fill. `**bold**` renders as <strong>; whitespace-pre-wrap
 *  keeps the assistant's newlines. An assistant reply may carry a trailing {{link:…}}
 *  marker (§ AI-5a), rendered as a react-router navigation button — never an <a href>
 *  that could leave the app.
 *
 *  `maskable` (task 7): a turn RELOADED from storage under hideBalance comes back
 *  COVERED — the whole bubble, never per-digit (finding "which part is a number" is a
 *  guess, and one wrong guess leaks). A tap reveals THIS bubble only; the reveal is
 *  local state, so masking a reloaded transcript costs nothing on the current round. */
function Bubble({
  role,
  text,
  maskable = false,
}: {
  role: 'user' | 'assistant'
  text: string
  maskable?: boolean
}) {
  const mine = role === 'user'
  const navigate = useNavigate()
  const [revealed, setRevealed] = useState(false)
  const masked = maskable && !revealed

  // Covered state: one tap-target the size of the bubble, no content rendered at all
  // (so nothing to read past), aligned like the real bubble it stands in for.
  if (masked) {
    return (
      <div
        className={`flex max-w-[85%] flex-col ${mine ? 'items-end self-end' : 'items-start self-start'}`}
      >
        <button
          type="button"
          onClick={() => setRevealed(true)}
          aria-label="แตะเพื่อแสดงข้อความที่ซ่อนไว้"
          className={`flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] ${
            mine
              ? 'rounded-[16px] rounded-br-[4px] bg-brand-tint text-brand-ink'
              : 'rounded-[16px] rounded-bl-[4px] bg-fill text-muted'
          }`}
        >
          <span aria-hidden>••••••</span>
          <span className="text-[11px] text-faint">แตะเพื่อดู</span>
        </button>
      </div>
    )
  }

  // Only the assistant emits the {{link:…}} marker; a user message is shown verbatim
  // (a user who types "{{link:…}}" must never get a live button out of it).
  const { body, link } = mine ? { body: text, link: null } : parseAssistantMessage(text)
  return (
    <div className={`flex max-w-[85%] flex-col gap-1.5 ${mine ? 'items-end self-end' : 'items-start self-start'}`}>
      <div
        className={`whitespace-pre-wrap px-3.5 py-2.5 text-[13px] leading-relaxed ${
          mine
            ? 'rounded-[16px] rounded-br-[4px] bg-brand-tint text-brand-ink'
            : 'rounded-[16px] rounded-bl-[4px] bg-fill text-ink'
        }`}
      >
        {renderBold(body)}
      </div>
      {link && (
        <button
          type="button"
          onClick={() => navigate(link.path)}
          className="rounded-input bg-brand-tint px-3 py-1.5 text-[12.5px] font-medium text-brand-ink"
        >
          {link.label}
        </button>
      )}
    </div>
  )
}
