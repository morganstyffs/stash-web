/**
 * AI proxy — identity + consent + rate limit gates, then the Anthropic call.
 *
 * This is the first ticket where /api/ai actually spends money (it forwards to
 * Anthropic). The mandatory order (docs/ai-assistant-design.md §3.1) is
 * enforced so a bad token / non-consenting / rate-limited caller is rejected
 * BEFORE any Anthropic cost:
 *
 *   verify token (auth.getUser) → consent → rate limit → Anthropic
 *
 * Security invariants:
 *   - Identity comes ONLY from the verified token. `user_id` is never read from
 *     the body. Consent and the rate limit are both keyed to that verified uid.
 *   - The per-request Supabase client uses the ANON key + the user's JWT, so
 *     every query (consent read AND tool RPCs) runs under `auth.uid()` and RLS
 *     is the last line of defence. service_role is NEVER used.
 *   - The ANTHROPIC_API_KEY lives only in worker/anthropic.ts and is never put
 *     in a response, log, or error. No CORS header — the route is same-origin.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { AnthropicError, runAssistant } from './anthropic'
import type { Env } from './index'
import { json } from './json'
import { checkRateLimit } from './rateLimit'

// User-facing Thai messages. Constants so the tests assert exact strings (a
// wording change that breaks a gate shows up as a failing test). The 401 line
// is identical for missing / expired / revoked so it never leaks which.
const SESSION_EXPIRED = 'เซสชันหมดอายุ เข้าสู่ระบบใหม่'
const NO_CONSENT = 'ยังไม่ได้เปิดใช้ผู้ช่วย AI — เปิดได้ในหน้าตั้งค่า'
const SERVICE_UNAVAILABLE = 'ผู้ช่วย AI ไม่พร้อมใช้งานชั่วคราว'
const RATE_LIMIT_MINUTE = 'ใช้ผู้ช่วยบ่อยเกินไป รอสักครู่แล้วลองใหม่'
const RATE_LIMIT_DAY = 'ใช้ผู้ช่วยครบโควตาของวันนี้แล้ว ลองใหม่พรุ่งนี้'
const BAD_QUESTION = 'กรุณาพิมพ์คำถามก่อน'
const ASSISTANT_UNAVAILABLE = 'ผู้ช่วยไม่พร้อมใช้งานชั่วคราว ลองใหม่อีกครั้ง'

/** Reads a bearer token from the Authorization header. Null when absent or
 *  malformed (→ treated as "no session" → 401). */
function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer[ \t]+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  return token ? token : null
}

/** Extracts a non-empty question string from the JSON body. Returns null when
 *  the body isn't the expected shape — identity is NOT taken from the body, so
 *  only `message` is read. */
async function readQuestion(request: Request): Promise<string | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  if (!body || typeof body !== 'object') return null
  const message = (body as { message?: unknown }).message
  if (typeof message !== 'string') return null
  const trimmed = message.trim()
  return trimmed ? trimmed : null
}

export async function handleAi(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405)
  }

  // ── Gate 1 · verify token (design §3.1) ──────────────────────────────────
  const token = readBearerToken(request)
  if (!token) {
    return json({ error: SESSION_EXPIRED }, 401)
  }

  // Supabase config comes from a server-side binding (see Env in index.ts) —
  // never hardcoded, never in wrangler.jsonc. Missing → can't verify → 503.
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = env
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: SERVICE_UNAVAILABLE }, 503)
  }

  // Per-request client carrying the user's JWT (anon key only, never
  // service_role). MUST NOT be a module-level singleton — one shared client
  // would leak a token across users. persistSession/autoRefreshToken off so no
  // browser storage/timer state leaks across requests in a reused isolate.
  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError) {
    // 401/403 = the token was rejected → session expired. Anything else
    // (Supabase outage) rethrows → index.ts 500 (fail closed). Matched on
    // status, never on message.
    if (userError.status === 401 || userError.status === 403) {
      return json({ error: SESSION_EXPIRED }, 401)
    }
    throw userError
  }
  const user = userData.user
  if (!user) {
    return json({ error: SESSION_EXPIRED }, 401)
  }

  // ── Gate 2 · consent (design §3.5 / §3.5.1) ──────────────────────────────
  // No row (maybeSingle → data=null) means "never opted in" = not consented.
  // no row → 403, consent=false → 403, consent=true → pass. A real DB error
  // rethrows → 500 (fail closed). Bound to the verified uid, not the body.
  const { data: settings, error: consentError } = await supabase
    .from('ai_settings')
    .select('consent')
    .eq('user_id', user.id)
    .maybeSingle()
  if (consentError) {
    throw consentError
  }
  if (settings?.consent !== true) {
    return json({ error: NO_CONSENT }, 403)
  }

  // Keep the existing "no key" 503 — the feature is off without a key, so bail
  // before touching KV or Anthropic.
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'AI ยังไม่ได้ตั้งค่า (ไม่มี ANTHROPIC_API_KEY ฝั่ง server)' }, 503)
  }

  // Read the question up front so a malformed body 400s without spending quota.
  const question = await readQuestion(request)
  if (!question) {
    return json({ error: BAD_QUESTION }, 400)
  }

  // ── Gate 3 · rate limit, keyed to the verified uid (design §3.1 / §5) ─────
  // Missing KV binding → can't enforce the limit → fail closed (503) rather
  // than let requests reach Anthropic uncapped.
  if (!env.AI_RATE_LIMIT) {
    return json({ error: SERVICE_UNAVAILABLE }, 503)
  }
  const decision = await checkRateLimit(env.AI_RATE_LIMIT, user.id, Date.now())
  if (!decision.allowed) {
    return json({ error: decision.scope === 'day' ? RATE_LIMIT_DAY : RATE_LIMIT_MINUTE }, 429)
  }

  // ── Gate 4 · Anthropic (server-to-server, tools under the user's JWT) ─────
  try {
    const reply = await runAssistant({ question, apiKey: env.ANTHROPIC_API_KEY, supabase })
    return json({ reply }, 200)
  } catch (err) {
    if (err instanceof AnthropicError) {
      // Upstream unavailable/timeout → 502/504 with a generic Thai line. The
      // real error is not leaked (index.ts logs internals for 500s; here we
      // never even reach that path with upstream detail).
      return json({ error: ASSISTANT_UNAVAILABLE }, err.kind === 'timeout' ? 504 : 502)
    }
    throw err // unknown → index.ts → 500 (fail closed, no leak)
  }
}
