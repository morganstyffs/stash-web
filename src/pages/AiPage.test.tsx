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
 *  • ephemeral only — the source writes no localStorage / DB for the transcript (§8).
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
})
afterEach(cleanup)

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

  it('a successful send renders the assistant reply', async () => {
    h.askAssistant.mockResolvedValue('เดือนนี้จ่าย ฿1,200 (จากสรุปเดือน)')
    renderAt()

    fireEvent.change(screen.getByLabelText('พิมพ์คำถาม'), { target: { value: 'จ่ายเท่าไหร่' } })
    fireEvent.click(screen.getByLabelText('ส่งคำถาม'))

    expect(await screen.findByText('เดือนนี้จ่าย ฿1,200 (จากสรุปเดือน)')).toBeTruthy()
    expect(h.askAssistant).toHaveBeenCalledWith('จ่ายเท่าไหร่', 'live-token')
  })
})

describe('structural guarantees', () => {
  it('takes NO hideBalance prop (structural, like WalletTransferSheet — §5)', () => {
    // @ts-expect-error — the chat accepts no props at all; a hideBalance prop must
    // never exist. If one is added, this @ts-expect-error goes unused and tsc fails.
    const el = <AiPage hideBalance={false} />
    expect(el).toBeTruthy()
  })

  it('never persists the transcript to localStorage or the DB (§8, ephemeral)', () => {
    // grep the shipped source — the transcript lives in useState only.
    const page = readFileSync('src/pages/AiPage.tsx', 'utf8')
    const net = readFileSync('src/lib/aiChat.ts', 'utf8')
    for (const src of [page, net]) {
      // match actual access (localStorage.setItem / localStorage[…]), not the prose
      // in the comments that explains we deliberately don't touch it.
      expect(src).not.toMatch(/localStorage\s*[.[]/)
      expect(src).not.toMatch(/sessionStorage\s*[.[]/)
      expect(src).not.toMatch(/supabase/) // no Supabase client in the chat path
      expect(src).not.toMatch(/\.from\(/) // no PostgREST table access
    }
  })
})
