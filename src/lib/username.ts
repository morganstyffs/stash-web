/**
 * Username rules — ONE place (convention 3) so the input field, the client-side
 * validity check, the shown rule, and the DB CHECK in migration 0020 can never
 * drift apart. Stored lowercase; a-z / 0-9 / underscore; length 3–20.
 */
const USERNAME_RE = /^[a-z0-9_]{3,20}$/

/** Human-readable rule, shown as a hint BEFORE saving (never only after a failed
 *  save). Mirrors USERNAME_RE. */
export const USERNAME_RULE_TEXT = 'ใช้ a–z, 0–9 และ _ ยาว 3–20 ตัว'

/** Force the shape the DB stores: lowercase, no spaces. Applied on every
 *  keystroke so the field is always in canonical form (friend_request_send also
 *  lowercases its input server-side). */
export function normalizeUsername(input: string): string {
  return input.toLowerCase().replace(/\s+/g, '')
}

export function isValidUsername(u: string): boolean {
  return USERNAME_RE.test(u)
}
