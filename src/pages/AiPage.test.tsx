// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

/**
 * PR-5 chat UI. The invariants proven here (design §5 / §8 / task):
 *  • consent gate — 'on' shows the chat; never_chosen / off redirect to Settings
 *    (never a chat that would only 403), with a plain-language toast.
 *  • one request at a time — the send button is disabled while a request is in
 *    flight and a second click can't fire a second (paid) request.
 *  • errors reach the user — a failed send surfaces the Thai line via errors.ts.
 *  • no hideBalance prop — structural, like WalletTransferSheet (§5).
 *  • persistence (task 7) — the transcript survives a remount via localStorage (owned
 *    by prefs.ts), is masked on reload under hideBalance, and is wiped by the clear
 *    button / consent-off; never the DB. Proven in the "persistence (task 7)" block.
 */

const h = vi.hoisted(() => ({
  consent: 'on' as 'on' | 'off' | 'never_chosen' | undefined,
  consentLoading: false,
  askAssistant: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/hooks/useAiSettings', () => ({
  useConsent: () => ({ data: h.consent, isLoading: h.consentLoading }),
}))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ session: { access_token: 'live-token' } }),
}))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ error: h.toastError, success: h.toastSuccess }),
}))
vi.mock('@/lib/aiChat', () => ({
  askAssistant: (...a: unknown[]) => h.askAssistant(...a),
  // AiHttpError is imported by errors.ts path only through the component's catch;
  // the component uses translateError on whatever askAssistant rejects with.
  AiHttpError: class AiHttpError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  },
}))

import { AiPage } from '@/pages/AiPage'
import { AiHttpError } from '@/lib/aiChat'
// The REAL prefs.ts (not mocked) drives persistence against jsdom's localStorage —
// seeding via these helpers is exactly what a prior session / another screen would do.
import { loadChatHistory, saveChatHistory, saveHideBalance } from '@/lib/prefs'

function renderAt() {
  return render(
    <MemoryRouter initialEntries={['/ai']}>
      <Routes>
        <Route path="/ai" element={<AiPage />} />
        <Route path="/settings" element={<div>หน้าตั้งค่า</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  h.consent = 'on'
  h.consentLoading = false
  h.askAssistant.mockReset()
  h.toastError.mockReset()
  h.toastSuccess.mockReset()
  // The transcript now persists to localStorage (task 7); clear it between tests so
  // one test's messages can't reload into the next and skew "first send" / bubble counts.
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('consent gate', () => {
  it("consent 'on' → shows the chat (title + example prompts + own-money note)", () => {
    renderAt()
    expect(screen.getByText('ผู้ช่วย AI')).toBeTruthy()
    expect(screen.getByText('ถามเรื่องเงินของคุณได้เลย')).toBeTruthy()
    expect(screen.getByText('เดือนที่แล้วจ่ายค่าอาหารไปเท่าไหร่')).toBeTruthy()
    // sets the expectation that friends/ยอดค้าง are out of scope (§6)
    expect(screen.getByText(/ยังไม่ตอบเรื่องยอดค้างกับเพื่อน/)).toBeTruthy()
  })

  for (const state of ['off', 'never_chosen'] as const) {
    it(`consent '${state}' → redirects to Settings (no chat) + explains via toast`, async () => {
      h.consent = state
      renderAt()
      expect(screen.getByText('หน้าตั้งค่า')).toBeTruthy()
      expect(screen.queryByText('ถามเรื่องเงินของคุณได้เลย')).toBeNull()
      await waitFor(() =>
        expect(h.toastError).toHaveBeenCalledWith('เปิดใช้ผู้ช่วย AI ในหน้าตั้งค่าก่อนเริ่มใช้งาน'),
      )
    })
  }
})

describe('one request at a time', () => {
  it('send is disabled while a request is in flight, and a second click cannot fire another', () => {
    // A request that never resolves keeps the component in the pending state.
    h.askAssistant.mockReturnValue(new Promise<string>(() => {}))
    renderAt()

    const box = screen.getByLabelText('พิมพ์คำถาม')
    fireEvent.change(box, { target: { value: 'เดือนนี้จ่ายเท่าไหร่' } })
    const sendBtn = screen.getByLabelText('ส่งคำถาม') as HTMLButtonElement

    fireEvent.click(sendBtn)
    expect(h.askAssistant).toHaveBeenCalledTimes(1)
    expect(sendBtn.disabled).toBe(true) // pending → disabled

    fireEvent.click(sendBtn) // ignored while pending
    expect(h.askAssistant).toHaveBeenCalledTimes(1)
  })

  it('send is disabled when the box is empty', () => {
    renderAt()
    expect((screen.getByLabelText('ส่งคำถาม') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('errors reach the user', () => {
  it('a failed send surfaces the Worker Thai line (mapped by errors.ts) as an alert', async () => {
    h.askAssistant.mockRejectedValue(
      new AiHttpError(429, 'ใช้ผู้ช่วยบ่อยเกินไป รอสักครู่แล้วลองใหม่'),
    )
    renderAt()

    fireEvent.change(screen.getByLabelText('พิมพ์คำถาม'), { target: { value: 'q' } })
    fireEvent.click(screen.getByLabelText('ส่งคำถาม'))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('ใช้ผู้ช่วยบ่อยเกินไป รอสักครู่แล้วลองใหม่')
    // the question stays in the transcript so the user sees what failed
    expect(screen.getByText('q')).toBeTruthy()
  })

  it('a successful send renders the assistant reply (first send carries empty history)', async () => {
    h.askAssistant.mockResolvedValue('เดือนนี้จ่าย ฿1,200 (จากสรุปเดือน)')
    renderAt()

    fireEvent.change(screen.getByLabelText('พิมพ์คำถาม'), { target: { value: 'จ่ายเท่าไหร่' } })
    fireEvent.click(screen.getByLabelText('ส่งคำถาม'))

    expect(await screen.findByText('เดือนนี้จ่าย ฿1,200 (จากสรุปเดือน)')).toBeTruthy()
    // The transcript is empty on the first send, so history is [].
    expect(h.askAssistant).toHaveBeenCalledWith('จ่ายเท่าไหร่', 'live-token', [])
  })

  it('a follow-up send passes the prior transcript (multi-turn) as of send time', async () => {
    h.askAssistant.mockResolvedValueOnce('เดือนที่แล้วจ่าย ฿2,000')
    h.askAssistant.mockResolvedValueOnce('เดือนก่อนหน้าจ่าย ฿1,500')
    renderAt()

    const box = screen.getByLabelText('พิมพ์คำถาม')
    const btn = screen.getByLabelText('ส่งคำถาม')

    fireEvent.change(box, { target: { value: 'เดือนที่แล้วจ่ายเท่าไหร่' } })
    fireEvent.click(btn)
    expect(await screen.findByText('เดือนที่แล้วจ่าย ฿2,000')).toBeTruthy()

    fireEvent.change(box, { target: { value: 'แล้วเดือนก่อนหน้าล่ะ' } })
    fireEvent.click(btn)
    expect(await screen.findByText('เดือนก่อนหน้าจ่าย ฿1,500')).toBeTruthy()

    // The 2nd call carries the transcript AS OF that send: the prior Q + its reply,
    // not yet the new question (which is appended after the snapshot is taken).
    expect(h.askAssistant).toHaveBeenNthCalledWith(2, 'แล้วเดือนก่อนหน้าล่ะ', 'live-token', [
      { role: 'user', text: 'เดือนที่แล้วจ่ายเท่าไหร่' },
      { role: 'assistant', text: 'เดือนที่แล้วจ่าย ฿2,000' },
    ])
  })

  it('each history turn sent carries ONLY role + text (never extra fields)', async () => {
    // ⚠️ DOCUMENTATION, NOT A SAFETY NET. While `ChatMessage` has exactly the two
    // fields {role, text}, this assertion stays green whether AiPage maps
    // field-by-field OR passes `messages` through — so it CANNOT catch a future
    // regression on its own. The real guard is the `: ChatTurn[]` annotation in
    // AiPage.send() (compile-time excess-property check). This test just records
    // the wire contract: the Worker's parseHistory is an allowlist and rejects any
    // turn with extra keys. (No `as any` to forge a fake field — convention 12.)
    h.askAssistant.mockResolvedValueOnce('เดือนที่แล้วจ่าย ฿2,000')
    h.askAssistant.mockResolvedValueOnce('ตอบสอง')
    renderAt()

    const box = screen.getByLabelText('พิมพ์คำถาม')
    const btn = screen.getByLabelText('ส่งคำถาม')

    fireEvent.change(box, { target: { value: 'q1' } })
    fireEvent.click(btn)
    expect(await screen.findByText('เดือนที่แล้วจ่าย ฿2,000')).toBeTruthy()

    fireEvent.change(box, { target: { value: 'q2' } })
    fireEvent.click(btn)
    expect(await screen.findByText('ตอบสอง')).toBeTruthy()

    const history = h.askAssistant.mock.calls[1][2] as Array<Record<string, unknown>>
    expect(history.length).toBeGreaterThan(0)
    for (const turn of history) {
      expect(Object.keys(turn).sort()).toEqual(['role', 'text'])
    }
  })
})

describe('bubble renders **bold** only (no raw markdown on screen)', () => {
  async function sendAndGetReply(reply: string) {
    h.askAssistant.mockResolvedValueOnce(reply)
    renderAt()
    fireEvent.change(screen.getByLabelText('พิมพ์คำถาม'), { target: { value: 'q' } })
    fireEvent.click(screen.getByLabelText('ส่งคำถาม'))
  }

  it('**text** renders as <strong> with the asterisks gone', async () => {
    await sendAndGetReply('จ่าย **฿9,000** ครับ')
    const strong = await screen.findByText('฿9,000')
    expect(strong.tagName).toBe('STRONG')
    // the surrounding bubble shows no literal asterisks
    expect(strong.parentElement?.textContent).toBe('จ่าย ฿9,000 ครับ')
  })

  it('an unmatched ** is left literal (visible signal the prompt was violated) — no crash', async () => {
    await sendAndGetReply('ยอด ** ยังไม่ปิด')
    expect(await screen.findByText('ยอด ** ยังไม่ปิด')).toBeTruthy()
  })

  it('plain text is unchanged', async () => {
    await sendAndGetReply('เหลือ ฿100 ครับ')
    expect(await screen.findByText('เหลือ ฿100 ครับ')).toBeTruthy()
  })
})

describe('answers can deep-link into a real screen (§ AI-5a)', () => {
  // A route table that also has /history, so a click can actually land somewhere.
  function renderWithHistory() {
    return render(
      <MemoryRouter initialEntries={['/ai']}>
        <Routes>
          <Route path="/ai" element={<AiPage />} />
          <Route path="/settings" element={<div>หน้าตั้งค่า</div>} />
          <Route path="/history" element={<div>หน้าประวัติ</div>} />
        </Routes>
      </MemoryRouter>,
    )
  }
  async function send(reply: string) {
    h.askAssistant.mockResolvedValueOnce(reply)
    renderWithHistory()
    fireEvent.change(screen.getByLabelText('พิมพ์คำถาม'), { target: { value: 'q' } })
    fireEvent.click(screen.getByLabelText('ส่งคำถาม'))
  }
  // The marker the Worker SYSTEM_PROMPT tells the model to append.
  const OK_MARKER = '{{link:/history?m=2026-07&cat=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa&filter=expense}}'

  it('a valid marker becomes a human-labelled button; the raw marker is never shown', async () => {
    await send(`เดือนกรกฎาคม 2569 จ่ายค่าอาหาร ฿4,000 ครับ\n${OK_MARKER}`)
    // the spoken answer stays…
    expect(await screen.findByText('เดือนกรกฎาคม 2569 จ่ายค่าอาหาร ฿4,000 ครับ')).toBeTruthy()
    // …as a button with human text, not a URL…
    expect(screen.getByRole('button', { name: 'ดูรายการทั้งหมด' })).toBeTruthy()
    // …and the raw {{link:…}} line never reaches the screen. `content` is the
    // element's own direct text (not its subtree), so this matches at most the
    // one bubble that would hold the marker — never its ancestors.
    expect(screen.queryByText((content) => content.includes('{{link:'))).toBeNull()
  })

  it('clicking the button navigates in-app (react-router), no <a href> that leaves the app', async () => {
    await send(`จ่าย ฿4,000 ครับ\n{{link:/history?m=2026-07&filter=expense}}`)
    fireEvent.click(await screen.findByRole('button', { name: 'ดูรายการทั้งหมด' }))
    expect(await screen.findByText('หน้าประวัติ')).toBeTruthy()
  })

  it('a malformed marker is left as raw text (visible signal), never dropped, and makes no button', async () => {
    await send('จ่าย ฿4,000 ครับ\n{{link:}}')
    // the broken marker survives on screen…
    const bubble = await screen.findByText((content) => content.includes('{{link:}}'))
    expect(bubble).toBeTruthy()
    // …and no button was produced.
    expect(screen.queryByRole('button', { name: 'ดูรายการทั้งหมด' })).toBeNull()
  })

  it('a path OUTSIDE the route allowlist is refused — no button (security: path is model text)', async () => {
    await send('ไปที่ตั้งค่า\n{{link:/settings?x=1}}')
    expect(screen.queryByRole('button', { name: 'ดูรายการทั้งหมด' })).toBeNull()
    // it certainly never navigated there
    expect(screen.queryByText('หน้าตั้งค่า')).toBeNull()
  })

  it('a protocol-relative path (off-site) is refused — never navigated', async () => {
    await send('ดูเพิ่ม\n{{link://evil.example.com/history}}')
    expect(screen.queryByRole('button', { name: 'ดูรายการทั้งหมด' })).toBeNull()
  })

  it('a user message that literally contains a marker never becomes a button', async () => {
    // Only assistant replies are parsed for the marker. The user's own text is shown verbatim.
    h.askAssistant.mockReturnValue(new Promise<string>(() => {})) // keep it pending; we only care about the echoed user turn
    renderWithHistory()
    fireEvent.change(screen.getByLabelText('พิมพ์คำถาม'), {
      target: { value: '{{link:/history?m=2026-07&filter=expense}}' },
    })
    fireEvent.click(screen.getByLabelText('ส่งคำถาม'))
    expect(await screen.findByText((content) => content.includes('{{link:/history'))).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'ดูรายการทั้งหมด' })).toBeNull()
  })
})

describe('structural guarantees', () => {
  it('takes NO hideBalance prop (structural, like WalletTransferSheet — §5)', () => {
    // @ts-expect-error — the chat accepts no props at all; a hideBalance prop must
    // never exist. If one is added, this @ts-expect-error goes unused and tsc fails.
    const el = <AiPage hideBalance={false} />
    expect(el).toBeTruthy()
  })

  it('persists ONLY via prefs.ts — never touches localStorage / the DB directly (task 7)', () => {
    // Persistence is real now (task 7), but it must funnel through prefs.ts (the one
    // owner of every `stash.*` key), never raw storage in the page or the network
    // layer, and never the DB. grep the shipped source to hold that line.
    const page = readFileSync('src/pages/AiPage.tsx', 'utf8')
    const net = readFileSync('src/lib/aiChat.ts', 'utf8')
    for (const src of [page, net]) {
      // no direct storage access — it goes through prefs.ts's load/save/clear helpers.
      expect(src).not.toMatch(/localStorage\s*[.[]/)
      expect(src).not.toMatch(/sessionStorage\s*[.[]/)
      expect(src).not.toMatch(/supabase/) // no Supabase client in the chat path
      expect(src).not.toMatch(/\.from\(/) // no PostgREST table access — never the DB
    }
  })
})

describe('persistence (task 7)', () => {
  const box = () => screen.getByLabelText('พิมพ์คำถาม')
  const sendBtn = () => screen.getByLabelText('ส่งคำถาม')

  it('a sent transcript survives a remount (reload) and is shown again', async () => {
    h.askAssistant.mockResolvedValueOnce('เดือนที่แล้วจ่าย ฿2,000')
    const { unmount } = renderAt()
    fireEvent.change(box(), { target: { value: 'เดือนที่แล้วจ่ายเท่าไหร่' } })
    fireEvent.click(sendBtn())
    expect(await screen.findByText('เดือนที่แล้วจ่าย ฿2,000')).toBeTruthy()
    // it reached storage…
    expect(loadChatHistory()).toEqual([
      { role: 'user', text: 'เดือนที่แล้วจ่ายเท่าไหร่' },
      { role: 'assistant', text: 'เดือนที่แล้วจ่าย ฿2,000' },
    ])

    // …and a fresh mount (= a reload) shows it again, no request needed.
    unmount()
    renderAt()
    expect(await screen.findByText('เดือนที่แล้วจ่ายเท่าไหร่')).toBeTruthy()
    expect(screen.getByText('เดือนที่แล้วจ่าย ฿2,000')).toBeTruthy()
  })

  it('a reloaded transcript sent as history to askAssistant carries ONLY role + text', async () => {
    // Seed a saved transcript (the `persisted` flag is added on load, in memory only).
    saveChatHistory([
      { role: 'user', text: 'เดือนที่แล้วจ่ายเท่าไหร่' },
      { role: 'assistant', text: 'จ่าย ฿2,000' },
    ])
    h.askAssistant.mockResolvedValueOnce('เดือนก่อนหน้าจ่าย ฿1,500')
    renderAt()
    // wait for the reloaded turns to appear before asking again
    expect(await screen.findByText('จ่าย ฿2,000')).toBeTruthy()

    fireEvent.change(box(), { target: { value: 'แล้วเดือนก่อนหน้าล่ะ' } })
    fireEvent.click(sendBtn())
    expect(await screen.findByText('เดือนก่อนหน้าจ่าย ฿1,500')).toBeTruthy()

    const history = h.askAssistant.mock.calls[0][2] as Array<Record<string, unknown>>
    expect(history).toEqual([
      { role: 'user', text: 'เดือนที่แล้วจ่ายเท่าไหร่' },
      { role: 'assistant', text: 'จ่าย ฿2,000' },
    ])
    // the render-only `persisted` flag never rides onto the wire
    for (const turn of history) expect(Object.keys(turn).sort()).toEqual(['role', 'text'])
  })

  it('the clear button empties both the screen and the store', async () => {
    h.askAssistant.mockResolvedValueOnce('จ่าย ฿2,000')
    renderAt()
    fireEvent.change(box(), { target: { value: 'q1' } })
    fireEvent.click(sendBtn())
    expect(await screen.findByText('จ่าย ฿2,000')).toBeTruthy()
    expect(loadChatHistory()).toHaveLength(2)

    fireEvent.click(screen.getByLabelText('ล้างประวัติแชท'))
    // screen returns to the empty state…
    expect(screen.getByText('ถามเรื่องเงินของคุณได้เลย')).toBeTruthy()
    expect(screen.queryByText('จ่าย ฿2,000')).toBeNull()
    // …and the store is empty.
    expect(loadChatHistory()).toEqual([])
  })

  it('with consent not on, the page neither reads nor overwrites the store (redirects)', () => {
    // A transcript from when consent WAS on must be left untouched by a visit while
    // consent is off — the page redirects and writes nothing (§"ห้ามเก็บเมื่อยังไม่ยินยอม").
    // (Clearing on consent-OFF is Settings' job, proven in SettingsPage's test.)
    h.consent = 'off'
    saveChatHistory([{ role: 'user', text: 'ของเก่า' }])
    renderAt()
    expect(screen.getByText('หน้าตั้งค่า')).toBeTruthy() // redirected, no chat
    expect(loadChatHistory()).toEqual([{ role: 'user', text: 'ของเก่า' }])
  })
})

describe('hideBalance masks the RELOADED transcript, tap reveals, current round stays open', () => {
  const box = () => screen.getByLabelText('พิมพ์คำถาม')
  const sendBtn = () => screen.getByLabelText('ส่งคำถาม')
  const COVER = 'แตะเพื่อแสดงข้อความที่ซ่อนไว้'

  function seedReloadUnderHideBalance() {
    saveHideBalance(true)
    saveChatHistory([
      { role: 'user', text: 'ยอดเดือนก่อน' },
      { role: 'assistant', text: 'จ่าย ฿9,999' },
    ])
  }

  it('reloaded turns come back covered — the figures are not on screen at a glance', () => {
    seedReloadUnderHideBalance()
    renderAt()
    // both reloaded bubbles are covered; none of their text is readable
    expect(screen.queryByText('จ่าย ฿9,999')).toBeNull()
    expect(screen.queryByText('ยอดเดือนก่อน')).toBeNull()
    expect(screen.getAllByLabelText(COVER)).toHaveLength(2)
  })

  it('a tap reveals THAT bubble only, one at a time', () => {
    seedReloadUnderHideBalance()
    renderAt()
    const covers = screen.getAllByLabelText(COVER)
    expect(covers).toHaveLength(2)
    fireEvent.click(covers[1]) // reveal the assistant figure
    expect(screen.getByText('จ่าย ฿9,999')).toBeTruthy()
    // the other bubble is still covered
    expect(screen.queryByText('ยอดเดือนก่อน')).toBeNull()
    expect(screen.getAllByLabelText(COVER)).toHaveLength(1)
  })

  it('the current round (just asked) is never covered', async () => {
    seedReloadUnderHideBalance()
    h.askAssistant.mockResolvedValueOnce('เดือนนี้จ่าย ฿5,000')
    renderAt()

    fireEvent.change(box(), { target: { value: 'เดือนนี้ล่ะ' } })
    fireEvent.click(sendBtn())
    // the brand-new question + reply are readable immediately, no cover
    expect(await screen.findByText('เดือนนี้จ่าย ฿5,000')).toBeTruthy()
    expect(screen.getByText('เดือนนี้ล่ะ')).toBeTruthy()
    // the OLD reloaded turns are still covered (only the two seeded ones)
    expect(screen.getAllByLabelText(COVER)).toHaveLength(2)
  })

  it('without hideBalance, a reloaded transcript is shown plainly (no cover)', () => {
    // hideBalance defaults off (store cleared in beforeEach) → reload shows real text.
    saveChatHistory([{ role: 'assistant', text: 'จ่าย ฿9,999' }])
    renderAt()
    expect(screen.getByText('จ่าย ฿9,999')).toBeTruthy()
    expect(screen.queryByLabelText(COVER)).toBeNull()
  })
})
