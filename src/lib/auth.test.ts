import { describe, it, expect } from 'vitest'
import type { AuthError } from '@supabase/supabase-js'
import {
  resetRequestOutcome,
  resetPageState,
  validateNewPassword,
  RESET_EMAIL_SENT_MESSAGE,
} from '@/lib/auth'

// Build a minimal AuthError-shaped object for the branches translateError reads.
const authErr = (over: Partial<AuthError>): AuthError => ({ name: 'AuthApiError', message: '', ...over }) as AuthError

describe('resetRequestOutcome — enumeration-safe (Convention 17)', () => {
  it('shows the SAME neutral message whether or not the email exists', () => {
    // resetPasswordForEmail returns `error: null` for BOTH an existing and a
    // non-existent address (Supabase design), so both real cases flow through
    // here identically — the outcome can never reveal which one happened.
    const existing = resetRequestOutcome(null)
    const missing = resetRequestOutcome(null)
    expect(existing).toEqual(missing)
    expect(existing.ok).toBe(true)
    expect(existing.message).toBe(RESET_EMAIL_SENT_MESSAGE)
  })

  it('the sent message never asserts the account does or does not exist', () => {
    // It may say "ถ้าอีเมลนี้มีบัญชี" (conditional) but must not confirm/deny.
    expect(RESET_EMAIL_SENT_MESSAGE).toMatch(/^ถ้า/) // conditional framing
    expect(RESET_EMAIL_SENT_MESSAGE).not.toMatch(
      /ไม่มีบัญชี|ไม่พบอีเมล|ไม่พบบัญชี|not found|no account|doesn't exist/i,
    )
  })

  it('surfaces only non-revealing operational errors (rate limit / offline)', () => {
    const rateLimited = resetRequestOutcome(authErr({ code: 'over_email_send_rate_limit' }))
    expect(rateLimited.ok).toBe(false)
    expect(rateLimited.message).toMatch(/ลองบ่อยเกินไป/)
    expect(rateLimited.message).not.toMatch(/บัญชี|อีเมลนี้/)

    const offline = resetRequestOutcome(authErr({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }))
    expect(offline.ok).toBe(false)
    expect(offline.message).toMatch(/เชื่อมต่อเซิร์ฟเวอร์ไม่ได้/)
  })
})

describe('resetPageState — form is recovery-only (borrowed-phone guard)', () => {
  it('waits while auth is still loading', () => {
    expect(resetPageState({ loading: true, isRecovery: false })).toBe('checking')
    expect(resetPageState({ loading: true, isRecovery: true })).toBe('checking')
  })

  it('shows the form ONLY for a genuine recovery session', () => {
    expect(resetPageState({ loading: false, isRecovery: true })).toBe('form')
  })

  it('blocks a normal signed-in session (no recovery event) from the form', () => {
    // The security-critical case: a normal session must NEVER reach the form.
    expect(resetPageState({ loading: false, isRecovery: false })).toBe('invalid_link')
  })
})

describe('validateNewPassword', () => {
  it('accepts a long-enough matching password', () => {
    expect(validateNewPassword('secret123', 'secret123')).toBeNull()
  })

  it('rejects a password shorter than 6', () => {
    expect(validateNewPassword('abc', 'abc')).toMatch(/สั้นเกินไป/)
  })

  it('rejects a mismatch', () => {
    expect(validateNewPassword('secret123', 'secret124')).toBe('รหัสผ่านยืนยันไม่ตรงกัน')
  })

  it('reports the length problem first when both are wrong', () => {
    expect(validateNewPassword('ab', 'zz')).toMatch(/สั้นเกินไป/)
  })
})
