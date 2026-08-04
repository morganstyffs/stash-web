// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

/**
 * Query-param prefill for the assistant (task 5b §1): a /ai?q=… URL seeds the
 * composer with a question sent from another screen (the ถาม AI buttons), but
 * NOTHING is auto-sent — the user still presses ส่ง themselves. This is the ?q=
 * query-param path only (NOT an in-answer deep link — that's a separate ticket);
 * the filename says queryParam so the two never get confused.
 *
 *  🔴 The load-bearing case is "askAssistant is NOT called": every request is real
 *  money and quota, so opening the page (or a refresh / back-forward) must never
 *  fire a paid request the user didn't ask for. We prove the box carries the text
 *  AND that no request left the client.
 *
 * A separate file from AiPage.test.tsx on purpose — this only touches the ?q= path,
 * so it stays out of the way of the parallel edit to AiPage.tsx / its main test.
 */

const h = vi.hoisted(() => ({ askAssistant: vi.fn(), toastError: vi.fn() }))

vi.mock('@/hooks/useAiSettings', () => ({
  useConsent: () => ({ data: 'on', isLoading: false }),
}))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ session: { access_token: 'live-token' } }),
}))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ error: h.toastError, success: vi.fn() }),
}))
// Spy askAssistant so "was it called?" is checkable. AI_MAX_QUESTION_CHARS lives in
// its own module (@/lib/aiLimits), so it's the real shared value here — not mocked.
vi.mock('@/lib/aiChat', () => ({
  askAssistant: (...a: unknown[]) => h.askAssistant(...a),
}))

import { AiPage } from '@/pages/AiPage'
import { AI_MAX_QUESTION_CHARS } from '@/lib/aiLimits'

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/ai" element={<AiPage />} />
        <Route path="/settings" element={<div>หน้าตั้งค่า</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const box = () => screen.getByLabelText('พิมพ์คำถาม') as HTMLTextAreaElement

beforeEach(() => {
  h.askAssistant.mockReset()
  h.toastError.mockReset()
})
afterEach(cleanup)

describe('AiPage — /ai?q= query param prefills the composer but never auto-sends', () => {
  it('?q=<question> lands in the input, and askAssistant is NOT called', () => {
    renderAt('/ai?q=' + encodeURIComponent('เดือนนี้จ่ายเท่าไหร่'))
    expect(box().value).toBe('เดือนนี้จ่ายเท่าไหร่')
    // the whole point: opening the deep link spends NOTHING until the user taps ส่ง
    expect(h.askAssistant).not.toHaveBeenCalled()
    // and it's still the empty state — no message bubble was appended
    expect(screen.getByText('ถามเรื่องเงินของคุณได้เลย')).toBeTruthy()
  })

  it('no q → the composer is empty and the empty state is unchanged', () => {
    renderAt('/ai')
    expect(box().value).toBe('')
    expect(screen.getByText('ถามเรื่องเงินของคุณได้เลย')).toBeTruthy()
    expect(screen.getByText('เดือนที่แล้วจ่ายค่าอาหารไปเท่าไหร่')).toBeTruthy()
    expect(h.askAssistant).not.toHaveBeenCalled()
  })

  it('an over-long q is truncated to AI_MAX_QUESTION_CHARS, not left to break the page', () => {
    const long = 'ก'.repeat(AI_MAX_QUESTION_CHARS + 500)
    renderAt('/ai?q=' + encodeURIComponent(long))
    expect(box().value).toHaveLength(AI_MAX_QUESTION_CHARS)
    expect(box().value).toBe(long.slice(0, AI_MAX_QUESTION_CHARS))
    expect(h.askAssistant).not.toHaveBeenCalled()
  })
})
