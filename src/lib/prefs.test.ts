// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CHAT_HISTORY_MAX,
  clearChatHistory,
  loadChatHistory,
  saveChatHistory,
} from '@/lib/prefs'

/**
 * The localStorage store for the ผู้ช่วย AI transcript (task 7). The load-bearing
 * guarantees proven here:
 *  • round-trips — what's saved is read back as the same `{ role, text }`.
 *  • bounded — over the cap, the OLDEST turns are dropped so the newest survive
 *    (localStorage is small and a long transcript is worthless).
 *  • never throws — broken JSON / a non-array / a wrong-shaped element all collapse
 *    to `[]`. A corrupt store must never lock the user out of the app.
 *  • `{ role, text }` only — extra keys on a stored object never leak back out.
 */

const KEY = 'stash.ai.chat'

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('chat history — round-trip', () => {
  it('saves then loads back the same turns', () => {
    const turns = [
      { role: 'user' as const, text: 'เดือนที่แล้วจ่ายเท่าไหร่' },
      { role: 'assistant' as const, text: 'จ่าย ฿2,000' },
    ]
    saveChatHistory(turns)
    expect(loadChatHistory()).toEqual(turns)
  })

  it('an absent key loads as an empty array (fresh install)', () => {
    expect(loadChatHistory()).toEqual([])
  })

  it('clearing empties the store', () => {
    saveChatHistory([{ role: 'user', text: 'hi' }])
    expect(loadChatHistory()).toHaveLength(1)
    clearChatHistory()
    expect(loadChatHistory()).toEqual([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

describe('chat history — bounded to the newest CHAT_HISTORY_MAX', () => {
  it('over the cap, the oldest are dropped and the newest are kept', () => {
    const many = Array.from({ length: CHAT_HISTORY_MAX + 50 }, (_, i) => ({
      role: 'user' as const,
      text: `q${i}`,
    }))
    saveChatHistory(many)

    const back = loadChatHistory()
    expect(back).toHaveLength(CHAT_HISTORY_MAX)
    // the very newest survives…
    expect(back[back.length - 1].text).toBe(`q${CHAT_HISTORY_MAX + 49}`)
    // …and the oldest kept turn is exactly one cap-length back from the end,
    // i.e. the first 50 were dropped.
    expect(back[0].text).toBe('q50')
  })

  it('at or under the cap, everything is kept', () => {
    const some = Array.from({ length: 10 }, (_, i) => ({
      role: 'assistant' as const,
      text: `a${i}`,
    }))
    saveChatHistory(some)
    expect(loadChatHistory()).toHaveLength(10)
  })
})

describe('chat history — resilient to corruption (never throws)', () => {
  it('broken JSON → empty array', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadChatHistory()).toEqual([])
  })

  it('a non-array JSON value → empty array', () => {
    localStorage.setItem(KEY, JSON.stringify({ role: 'user', text: 'x' }))
    expect(loadChatHistory()).toEqual([])
  })

  it('wrong-shaped elements are dropped, well-formed ones survive', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { role: 'user', text: 'keep me' },
        { role: 'system', text: 'bad role' }, // unknown role → dropped
        { role: 'assistant' }, // missing text → dropped
        { role: 'assistant', text: 42 }, // non-string text → dropped
        null, // not an object → dropped
        { role: 'assistant', text: 'keep me too' },
      ]),
    )
    expect(loadChatHistory()).toEqual([
      { role: 'user', text: 'keep me' },
      { role: 'assistant', text: 'keep me too' },
    ])
  })

  it('extra keys on a stored turn are stripped on the way back out', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([{ role: 'user', text: 'hi', secret: 'leak', id: 7 }]),
    )
    const back = loadChatHistory()
    expect(back).toHaveLength(1)
    expect(Object.keys(back[0]).sort()).toEqual(['role', 'text'])
  })

  it('saving strips extra keys too (only { role, text } reaches disk)', () => {
    // A message type may carry a render-only field (e.g. AiPage's `persisted`); it
    // must never be written. Cast-free: `WithExtra` is a subtype of ChatTurn, so a
    // `WithExtra[]` passes to saveChatHistory without an assertion, and reading the
    // raw JSON back proves the extra key didn't survive.
    interface WithExtra {
      role: 'user'
      text: string
      persisted: boolean
    }
    const withExtra: WithExtra = { role: 'user', text: 'q', persisted: true }
    saveChatHistory([withExtra])
    // Read the RAW stored JSON (not via loadChatHistory, which would strip the key
    // on its own) to prove the write itself never put `persisted` on disk. JSON.parse
    // is typed `any`, so indexing needs no assertion.
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    expect(Array.isArray(stored)).toBe(true)
    expect(Object.keys(stored[0]).sort()).toEqual(['role', 'text'])
  })
})
