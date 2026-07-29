import { describe, it, expect } from 'vitest'
import { translateError } from '@/lib/errors'

// The exact user-facing strings, kept here so a wording change in errors.ts that
// breaks a security property (enumeration / leak / wrong bucket) shows up as a
// failing test rather than sliding through.
const WRONG_CREDENTIALS = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
const CONNECT_FAIL = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็กอินเทอร์เน็ต หรือระบบอาจปิดชั่วคราว แล้วลองใหม่'
const GENERIC = 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'

describe('translateError — no user enumeration', () => {
  it('wrong password and unknown email produce the identical message', () => {
    // Supabase returns invalid_credentials for BOTH; the app must not split them.
    const wrongPassword = translateError({ code: 'invalid_credentials', status: 400 })
    const noSuchEmail = translateError({ code: 'invalid_credentials', status: 400 })
    expect(wrongPassword).toBe(WRONG_CREDENTIALS)
    expect(noSuchEmail).toBe(wrongPassword)
    // the message itself must not hint which side was wrong
    expect(wrongPassword).not.toMatch(/ไม่มี|ไม่พบ|not found|no account/i)
  })

  it('never emits a message that an email IS / IS NOT registered', () => {
    // The old enumeration mappings (email_exists / user_already_exists /
    // "already registered") were removed — none may resurface in any form.
    const enumerationProbes: unknown[] = [
      { code: 'user_already_exists' },
      { code: 'email_exists' },
      { message: 'User already registered' },
      { message: 'Email address already been registered' },
      { code: 'user_not_found' },
      { message: 'User not found' },
    ]
    for (const err of enumerationProbes) {
      const out = translateError(err)
      expect(out).not.toMatch(/สมัครไว้แล้ว|มีบัญชี|ไม่มีบัญชี|already registered|exists/i)
    }
  })
})

describe('translateError — never leaks raw upstream detail', () => {
  it('drops the raw message (tokens / keys / URLs) for an unknown error', () => {
    const out = translateError({
      message: 'JWT malformed: eyJhbGciOiJIUzI1 apikey=sk_live_SECRET at https://ref.supabase.co/auth',
    })
    expect(out).toBe(GENERIC) // no code/status → no hint at all
    for (const leak of ['eyJhbGci', 'apikey', 'sk_live_SECRET', 'supabase.co', 'JWT']) {
      expect(out).not.toContain(leak)
    }
  })

  it('a code hint is the sanitised slug only, never the message', () => {
    const out = translateError({ code: 'PGRST301', message: 'secret token https://leak.example' })
    expect(out).toBe(`${GENERIC} (รหัส PGRST301)`)
    expect(out).not.toMatch(/secret|token|http/i)
  })

  it('rejects a malformed code so it cannot smuggle text into the hint', () => {
    // Code with spaces / punctuation fails the slug pattern → no hint appended.
    const out = translateError({ code: 'oops http://x?apikey=SECRET and spaces' })
    expect(out).toBe(GENERIC)
    expect(out).not.toMatch(/apikey|SECRET|http/i)
  })
})

describe('translateError — connectivity is its own bucket, not the generic line', () => {
  it('maps a retryable fetch error (offline) to the connect message', () => {
    expect(
      translateError({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }),
    ).toBe(CONNECT_FAIL)
  })

  it('maps a 503 (paused project) to the connect message', () => {
    const out = translateError({ status: 503, message: 'Service Unavailable' })
    expect(out).toBe(CONNECT_FAIL)
    expect(out).not.toBe(GENERIC)
  })

  it('maps a bare "Failed to fetch" (no code/status) to the connect message', () => {
    expect(translateError({ message: 'TypeError: Failed to fetch' })).toBe(CONNECT_FAIL)
  })
})

describe('translateError — known mappings still hold', () => {
  it('passes an already-Thai message through verbatim', () => {
    const authored = 'ลบไม่ได้ — สินค้านี้มีประวัติการขายแล้ว ต้องย้อนรายการขายก่อน'
    expect(translateError(new Error(authored))).toBe(authored)
  })

  it('maps email_not_confirmed and rate limits', () => {
    expect(translateError({ code: 'email_not_confirmed' })).toMatch(/ยังไม่ได้ยืนยันอีเมล/)
    expect(translateError({ code: 'over_request_rate_limit' })).toMatch(/ลองบ่อยเกินไป/)
    expect(translateError({ status: 429 })).toMatch(/ลองบ่อยเกินไป/)
  })

  it('maps a unique-violation SQLSTATE', () => {
    expect(translateError({ code: '23505' })).toBe('มีรายการนี้อยู่แล้ว')
  })

  it('handles a plain string and a non-object without throwing', () => {
    expect(translateError('boom')).toBe(GENERIC)
    expect(translateError(null)).toBe(GENERIC)
    expect(translateError(undefined)).toBe(GENERIC)
  })
})
