/**
 * Turns a raw Supabase / PostgREST / Postgres error into a short Thai message a
 * normal person can act on. Two rules keep it safe to call anywhere:
 *
 *  1. If the message already contains Thai characters, it's one we authored at
 *     the hook/callsite (e.g. the category-in-use message) — pass it through
 *     untouched instead of flattening it to the generic fallback.
 *  2. Otherwise map by SQLSTATE code first, then by known English message
 *     fragments (auth, network), then fall back to a generic line.
 */
export function translateError(err: unknown): string {
  let code: string | undefined
  let msg = ''
  if (typeof err === 'string') {
    msg = err
  } else if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string }
    code = e.code
    msg = e.message ?? ''
  }

  // (1) already a message we wrote in Thai — keep it verbatim.
  if (/[฀-๿]/.test(msg)) return msg

  // (2) Postgres / PostgREST SQLSTATE codes
  switch (code) {
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

  // (3) known message fragments (Supabase auth + network)
  const m = msg.toLowerCase()
  if (/invalid login credentials/.test(m)) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
  if (/email not confirmed/.test(m)) return 'ยังไม่ได้ยืนยันอีเมล — เช็กกล่องอีเมลก่อนเข้าสู่ระบบ'
  if (/user already registered|already been registered/.test(m))
    return 'อีเมลนี้สมัครไว้แล้ว — ลองเข้าสู่ระบบแทน'
  if (/password should be at least|password.*6/.test(m))
    return 'รหัสผ่านสั้นเกินไป (อย่างน้อย 6 ตัวอักษร)'
  if (/rate limit|too many requests/.test(m)) return 'ลองบ่อยเกินไป รอสักครู่แล้วลองใหม่'
  if (/failed to fetch|network|networkerror|timeout/.test(m))
    return 'เชื่อมต่อไม่ได้ — เช็กอินเทอร์เน็ตแล้วลองใหม่'

  // (4) generic fallback
  return 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'
}
