/**
 * Central error handler. Every user-facing failure in the app funnels through
 * `translateError` — turning a raw Supabase / PostgREST / Postgres / Auth error
 * into a short Thai message a normal person can act on, while keeping enough of
 * the real code around to debug. Never inline a Thai error string at a callsite:
 * add the case here so all screens stay consistent (see PROJECT_AUDIT F-04/F-14).
 *
 * Safety rules that keep it callable anywhere:
 *  1. If the message already contains Thai characters, it's one we authored at
 *     the hook/callsite (e.g. the category-in-use message) — pass it through
 *     untouched instead of flattening it to the generic fallback.
 *  2. Never surface the raw upstream message to the user (it can carry URLs /
 *     request ids). We show a curated Thai line, plus at most a short, safe code
 *     hint (SQLSTATE / auth slug / HTTP status) so a paused-project or unknown
 *     failure can still be reported.
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
 *  project being paused. This is the case that used to show nothing on login. */
function isConnectFailure(n: NormalizedError): boolean {
  if (n.name === 'AuthRetryableFetchError') return true
  if (typeof n.status === 'number' && CONNECT_FAIL_STATUS.has(n.status)) return true
  return /failed to fetch|networkerror|network error|fetch failed|load failed|timeout/i.test(
    n.message,
  )
}

/** A short, sanitised hint (never the raw message) so an otherwise-opaque error
 *  is still reportable. Only well-formed slugs / numeric statuses get through. */
function debugHint(n: NormalizedError): string | undefined {
  if (n.code && /^[A-Za-z0-9_.-]{1,40}$/.test(n.code)) return `รหัส ${n.code}`
  if (typeof n.status === 'number' && n.status > 0) return `รหัส ${n.status}`
  return undefined
}

/**
 * The `recurring_run_due` RPC (and any future one) doesn't exist until its
 * migration is applied. That specific "function not found" must stay silent —
 * every other failure should surface. Kept here so the check lives with the
 * rest of the error taxonomy instead of being re-derived at the callsite.
 */
export function isMissingFunctionError(err: unknown): boolean {
  const n = normalizeError(err)
  return n.code === 'PGRST202' || n.code === '42883'
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

  // (3) Postgres / PostgREST SQLSTATE codes
  switch (n.code) {
    case '23505':
      return 'มีรายการนี้อยู่แล้ว'
    case '23503':
    case '23001':
      return 'ทำรายการไม่ได้ เพราะยังมีข้อมูลอื่นอ้างอิงอยู่'
    case '23514':
      return 'ข้อมูลไม่ผ่านเงื่อนไข ลองตรวจตัวเลขอีกครั้ง'
    case '23502':
      return 'กรอกข้อมูลให้ครบก่อนบันทึก'
  }

  // (4) Supabase auth error codes (stable slugs — preferred over message text)
  switch (n.code) {
    case 'invalid_credentials':
      return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
    case 'email_not_confirmed':
      return 'ยังไม่ได้ยืนยันอีเมล — เช็กกล่องอีเมลก่อนเข้าสู่ระบบ'
    case 'user_already_exists':
    case 'email_exists':
      return 'อีเมลนี้สมัครไว้แล้ว — ลองเข้าสู่ระบบแทน'
    case 'weak_password':
      return 'รหัสผ่านสั้นเกินไป (อย่างน้อย 6 ตัวอักษร)'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่'
  }

  // (5) known message fragments (older Supabase auth without a `code`)
  const m = n.message.toLowerCase()
  if (/invalid login credentials/.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
  if (/email not confirmed/.test(m)) return 'ยังไม่ได้ยืนยันอีเมล — เช็กกล่องอีเมลก่อนเข้าสู่ระบบ'
  if (/user already registered|already been registered/.test(m))
    return 'อีเมลนี้สมัครไว้แล้ว — ลองเข้าสู่ระบบแทน'
  if (/password should be at least|password.*6/.test(m))
    return 'รหัสผ่านสั้นเกินไป (อย่างน้อย 6 ตัวอักษร)'
  if (/rate limit|too many requests/.test(m)) return 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่'

  // (6) generic fallback — keep a safe code hint so it's still reportable.
  const hint = debugHint(n)
  return hint ? `เกิดข้อผิดพลาด ลองใหม่อีกครั้ง (${hint})` : 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'
}
