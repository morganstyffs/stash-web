/**
 * Central error handler. Every user-facing failure in the app funnels through
 * `translateError` — turning a raw Supabase / PostgREST / Postgres / Auth error
 * into a short Thai message a normal person can act on, while keeping enough of
 * the real code around to debug. Never inline a Thai error string at a callsite:
 * add the case here so all screens stay consistent (see PROJECT_AUDIT F-04/F-14).
 *
 * Rules that keep it safe to call anywhere:
 *  1. If the message already contains Thai characters, it's one we authored at
 *     the hook/callsite (e.g. the category-in-use message) — pass it through
 *     untouched instead of flattening it to the generic fallback.
 *  2. Match on STRUCTURED fields (`code` / `status`) — never on message
 *     substrings — for anything that affects behaviour or picks a specific
 *     message. Upstream wording changes without notice; codes don't. The single
 *     exception is the connect-failure fallback (a raw fetch `TypeError` carries
 *     no code/status at all), and it's display-only — it never swallows.
 *  3. Never reveal whether an email has an account (user enumeration). Login and
 *     password-reset must read identically whether the address exists or not, so
 *     there is deliberately NO "email already registered / not found" mapping.
 *  4. Never surface the raw upstream message. Show a curated Thai line plus at
 *     most a short, safe code hint (SQLSTATE / auth slug / HTTP status).
 */

interface NormalizedError {
  /** SQLSTATE ('23505'), PostgREST ('PGRST202'), or Supabase auth slug. */
  code?: string
  /** HTTP status when the layer exposes one (auth / storage). */
  status?: number
  /** e.g. 'AuthRetryableFetchError' — the surest paused/offline signal. */
  name?: string
  message: string
}

/** HTTP statuses that mean "couldn't reach the service" (offline, timeout,
 *  Cloudflare edge, or a paused Supabase project) rather than a real rejection. */
const CONNECT_FAIL_STATUS = new Set([0, 502, 503, 504, 521, 522, 523, 524, 540, 544])

function normalizeError(err: unknown): NormalizedError {
  if (typeof err === 'string') return { message: err }
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    let status: number | undefined
    if (typeof e.status === 'number') status = e.status
    else if (typeof e.statusCode === 'number') status = e.statusCode
    else if (typeof e.status === 'string' && /^\d+$/.test(e.status)) status = Number(e.status)
    return {
      code: typeof e.code === 'string' ? e.code : undefined,
      status,
      name: typeof e.name === 'string' ? e.name : undefined,
      message: typeof e.message === 'string' ? e.message : '',
    }
  }
  return { message: '' }
}

/** True when the failure is "can't reach Supabase": offline, timeout, or the
 *  project being paused. This is the case that used to show nothing on login.
 *  Prefers structured fields; the message regex is the last resort because a raw
 *  fetch `TypeError` ("Failed to fetch" / "Load failed") has no code or status. */
function isConnectFailure(n: NormalizedError): boolean {
  if (n.name === 'AuthRetryableFetchError') return true
  if (typeof n.status === 'number' && CONNECT_FAIL_STATUS.has(n.status)) return true
  return /failed to fetch|networkerror|network error|fetch failed|load failed|timeout/i.test(
    n.message,
  )
}

/** Auth codes whose slug *is itself* an answer to "does this email have an
 *  account?" — echoing them as a debug hint would leak enumeration (rule 3), so
 *  they never reach the hint. They only arise from sign-up anyway (no UI). */
const ENUMERATION_CODES = new Set(['email_exists', 'user_already_exists', 'user_not_found'])

/** A short, sanitised hint (never the raw message) so an otherwise-opaque error
 *  is still reportable. Only well-formed slugs / numeric statuses get through,
 *  and an existence-revealing auth slug is dropped (falls back to the status). */
function debugHint(n: NormalizedError): string | undefined {
  const codeOk = n.code && /^[A-Za-z0-9_.-]{1,40}$/.test(n.code) && !ENUMERATION_CODES.has(n.code)
  if (codeOk) return `รหัส ${n.code}`
  if (typeof n.status === 'number' && n.status > 0) return `รหัส ${n.status}`
  return undefined
}

export function translateError(err: unknown): string {
  const n = normalizeError(err)

  // (1) already a message we wrote in Thai — keep it verbatim.
  if (/[฀-๿]/.test(n.message)) return n.message

  // (2) can't reach the server (offline / timeout / paused project). Checked
  //     before anything else because a paused project can arrive as a 503 that
  //     would otherwise fall through to the generic line.
  if (isConnectFailure(n)) {
    return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็กอินเทอร์เน็ต หรือระบบอาจปิดชั่วคราว แล้วลองใหม่'
  }

  // (3) rate limiting — by code, or the HTTP 429 status.
  if (
    n.code === 'over_request_rate_limit' ||
    n.code === 'over_email_send_rate_limit' ||
    n.status === 429
  ) {
    return 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่'
  }

  // (4) Postgres / PostgREST SQLSTATE codes
  switch (n.code) {
    case '23505':
      return 'มีรายการนี้อยู่แล้ว'
    case '23503':
    case '23001':
      return 'ทำรายการไม่ได้ เพราะยังมีข้อมูลอื่นอ้างอิงอยู่'
    case '23514':
      // CHECK violation — shared across constraints (numeric value bounds AND
      // the SKU prefix format, 0025). Kept general so it reads correctly for
      // both; the specific field is validated client-side before we ever get
      // here (rule 16: the error must still reach the user if it does fire).
      return 'ข้อมูลไม่ผ่านเงื่อนไข ลองตรวจรูปแบบที่กรอกอีกครั้ง'
    case '23502':
      return 'กรอกข้อมูลให้ครบก่อนบันทึก'
  }

  // (5) Supabase auth error codes (stable slugs).
  //     `invalid_credentials` is returned for BOTH a wrong password and an email
  //     with no account — Supabase does this on purpose to prevent enumeration,
  //     and we mirror it with one combined message. Do NOT add an "email exists /
  //     not found" case here (see rule 3).
  switch (n.code) {
    case 'invalid_credentials':
      return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
    case 'email_not_confirmed':
      return 'ยังไม่ได้ยืนยันอีเมล — เช็กกล่องอีเมลก่อนเข้าสู่ระบบ'
    case 'weak_password':
    case 'same_password':
      return 'รหัสผ่านไม่ปลอดภัยพอ — ตั้งใหม่ให้ยาวขึ้น (อย่างน้อย 6 ตัวอักษร)'
  }

  // (6) generic fallback — keep a safe code hint so it's still reportable.
  const hint = debugHint(n)
  return hint ? `เกิดข้อผิดพลาด ลองใหม่อีกครั้ง (${hint})` : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'
}
