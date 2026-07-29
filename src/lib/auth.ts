import type { AuthError } from '@supabase/supabase-js'
import { translateError } from '@/lib/errors'

/**
 * Auth helpers for the password-reset flow. Kept pure + exported so the
 * enumeration-safety and password rules can be unit-tested without a live
 * Supabase (see auth.test.ts).
 */

/**
 * Shown after a reset request ALWAYS — whether or not the email has an account.
 * `resetPasswordForEmail` returns success for a non-existent address on purpose,
 * and we mirror that: the UI must never tell the user whether the email is
 * registered (Convention 17, user enumeration).
 */
export const RESET_EMAIL_SENT_MESSAGE =
  'ถ้าอีเมลนี้มีบัญชีอยู่ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว — เช็กกล่องอีเมล (รวมถึงกล่องสแปม)'

/**
 * Maps the outcome of `resetPasswordForEmail` to the message to display.
 * On success → the neutral "sent if it exists" line (never reveals existence).
 * On error → only non-revealing operational errors surface (rate limit / can't
 * reach the server), routed through the central translator, which itself has no
 * enumeration branch (F-27).
 */
export function resetRequestOutcome(error: AuthError | null): { ok: boolean; message: string } {
  if (!error) return { ok: true, message: RESET_EMAIL_SENT_MESSAGE }
  return { ok: false, message: translateError(error) }
}

export type ResetPageState = 'checking' | 'invalid_link' | 'form'

/**
 * Gate for the reset-password screen. The new-password form must appear ONLY for
 * a genuine recovery session — one that arrived via the email link and fired a
 * `PASSWORD_RECOVERY` event (`isRecovery`). A normal signed-in session must NOT
 * reach the form: otherwise anyone holding an already-unlocked session (a
 * borrowed phone) could change the password without knowing the current one.
 * So `isRecovery === false` always blocks, even when a session exists.
 */
export function resetPageState(s: { loading: boolean; isRecovery: boolean }): ResetPageState {
  if (s.loading) return 'checking'
  return s.isRecovery ? 'form' : 'invalid_link'
}

/** Supabase Auth's minimum password length. Keep in sync with the dashboard. */
export const MIN_PASSWORD_LENGTH = 6

/**
 * Validates a new password + confirmation. Returns a Thai error string, or null
 * when acceptable. Same 6-char floor Supabase enforces server-side, checked here
 * first so the user gets an instant, localised message.
 */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `รหัสผ่านสั้นเกินไป (อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร)`
  }
  if (password !== confirm) return 'รหัสผ่านยืนยันไม่ตรงกัน'
  return null
}
