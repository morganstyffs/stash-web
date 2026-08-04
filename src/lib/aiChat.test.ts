import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiHttpError, askAssistant } from '@/lib/aiChat'
import { translateError } from '@/lib/errors'

/**
 * Contract test for the /api/ai client. Two things matter and are proven here:
 *  1. The request matches the Worker contract (src/worker/ai.ts): POST /api/ai,
 *     Authorization: Bearer <token>, JSON body { message }.
 *  2. Failures reach the user by STATUS, not by matching message substrings
 *     (§5 / convention 15). askAssistant tags the thrown error with the real HTTP
 *     status; translateError (the single mapping authority) turns it into Thai —
 *     the Worker's Thai line passed through when present, its own status-keyed line
 *     when the body has none (an edge error page).
 */

/** A minimal fetch Response stand-in: askAssistant only reads ok/status/json().
 *  Left untyped — the stubbed global fetch isn't type-checked against DOM `fetch`,
 *  so no cast is needed (and none of the banned `as unknown as` / `as any`). */
function res(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('askAssistant — request shape', () => {
  it('POSTs to /api/ai with the bearer token and { message } body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, { reply: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    await askAssistant('เดือนนี้จ่ายเท่าไหร่', 'tok-123')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ai')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok-123')
    expect(JSON.parse(init.body)).toEqual({ message: 'เดือนนี้จ่ายเท่าไหร่' })
  })

  it('returns the reply string on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { reply: 'ยอดคือ ฿100' })))
    await expect(askAssistant('q', 't')).resolves.toBe('ยอดคือ ฿100')
  })
})

// The Worker's exact Thai lines (src/worker/ai.ts) for the statuses PR-5 must cover.
const WORKER: Record<number, string> = {
  401: 'เซสชันหมดอายุ เข้าสู่ระบบใหม่',
  403: 'ยังไม่ได้เปิดใช้ผู้ช่วย AI — เปิดได้ในหน้าตั้งค่า',
  429: 'ใช้ผู้ช่วยบ่อยเกินไป รอสักครู่แล้วลองใหม่',
  502: 'ผู้ช่วยไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้ง',
  504: 'ผู้ช่วยไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้ง',
}

describe('askAssistant — failures reach the user by status (Thai)', () => {
  for (const status of [401, 403, 429, 502, 504]) {
    it(`${status}: throws AiHttpError(${status}) and translateError shows the Worker's Thai`, async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(status, { error: WORKER[status] })))

      const err = await askAssistant('q', 't').catch((e) => e)
      expect(err).toBeInstanceOf(AiHttpError)
      expect((err as AiHttpError).status).toBe(status) // caught by status, not substring
      expect(translateError(err)).toBe(WORKER[status])
    })
  }

  it('maps by status even when the body carries NO Thai (edge 429 → rate-limit line)', async () => {
    // A non-JSON edge body: json() rejects, message stays empty, status drives the map.
    const bad = { ok: false, status: 429, json: async () => Promise.reject(new Error('not json')) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bad))

    const err = await askAssistant('q', 't').catch((e) => e)
    expect((err as AiHttpError).status).toBe(429)
    expect(translateError(err)).toBe('ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่')
  })

  it('maps by status even when the body carries NO Thai (edge 502 → connect-failure line)', async () => {
    const bad = { ok: false, status: 502, json: async () => Promise.reject(new Error('not json')) }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(bad))

    const err = await askAssistant('q', 't').catch((e) => e)
    expect((err as AiHttpError).status).toBe(502)
    expect(translateError(err)).toBe(
      'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็กอินเทอร์เน็ต หรือระบบอาจปิดชั่วคราว แล้วลองใหม่',
    )
  })

  it("can't reach the server (fetch rejects) → reuse errors.ts isConnectFailure", async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const err = await askAssistant('q', 't').catch((e) => e)
    expect(translateError(err)).toBe(
      'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็กอินเทอร์เน็ต หรือระบบอาจปิดชั่วคราว แล้วลองใหม่',
    )
  })
})
