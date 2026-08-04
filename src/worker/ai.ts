/**
 * AI proxy — identity + consent gate for `POST /api/ai`.
 *
 * Purpose: keep the Anthropic API key SERVER-SIDE only. The client calls
 * `POST /api/ai` with `Authorization: Bearer <supabase access_token>`; this
 * handler verifies that token and checks the user's consent BEFORE anything
 * else. The endpoint itself is still a placeholder (returns 501) — this ticket
 * (PR-1a) only lands the two gates in the mandatory order from the design doc
 * (docs/ai-assistant-design.md §3.1):
 *
 *   verify token (auth.getUser)  →  consent  →  [rate limit = PR-1b]  →  [Anthropic = PR-1b]
 *
 * Every gate sits BEFORE the endpoint would ever cost the owner money, so a
 * missing/expired/revoked token or a non-consenting user is rejected up front
 * (design appendix: never let /api/ai become an open, unauthenticated,
 * money-spending endpoint).
 *
 * Security rules enforced here (design §3.1 / §3.2 / §3.5):
 *   - Identity comes ONLY from the verified token. `user_id` is NEVER read from
 *     the request body — there is no place to put it.
 *   - The per-request Supabase client uses the ANON key + the user's JWT, so
 *     every query runs under `auth.uid()` and RLS is the last line of defence
 *     (fail closed). service_role is NEVER used — it would bypass RLS entirely.
 *   - Consent is read server-side from `ai_settings` under RLS; a client-sent
 *     flag is never trusted (same principle as not trusting body `user_id`).
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { Env } from './index'
import { json } from './json'

// User-facing Thai messages. Kept as constants so the tests assert the exact
// strings (a wording change that breaks a gate shows up as a failing test).
// The 401 message is identical for missing / expired / revoked so it never
// leaks which case occurred.
const SESSION_EXPIRED = 'เซสชันหมดอายุ เข้าสู่ระบบใหม่'
const NO_CONSENT = 'ยังไม่ได้เปิดใช้ผู้ช่วย AI — เปิดได้ในหน้าตั้งค่า'
const SERVICE_UNAVAILABLE = 'ผู้ช่วย AI ไม่พร้อมใช้งานชั่วคราว'

/** Reads a bearer token from the Authorization header. Returns null when the
 *  header is absent or malformed (→ treated as "no session" → 401). */
function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer[ \t]+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  return token ? token : null
}

export async function handleAi(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405)
  }

  // ── Gate 1 · verify token (design §3.1) ──────────────────────────────────
  // No token → anonymous caller → 401 up front, before any DB / Anthropic work.
  const token = readBearerToken(request)
  if (!token) {
    return json({ error: SESSION_EXPIRED }, 401)
  }

  // Supabase config comes from a server-side binding (see Env in index.ts) —
  // never hardcoded, never in wrangler.jsonc. Without it we cannot verify the
  // token, so fail closed with a neutral 503 (no internal detail leaked).
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = env
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: SERVICE_UNAVAILABLE }, 503)
  }

  // Build a Supabase client PER REQUEST, carrying this user's JWT (anon key +
  // Authorization: Bearer). This MUST NOT be a module-level singleton reused
  // across requests: one shared client would hold one user's token and leak it
  // into another user's request. A fresh client per request keeps each token
  // bound to its own request. anon key only — service_role is never used, so
  // every query below runs under this user's auth.uid() and RLS gates it.
  // persistSession/autoRefreshToken are off (their browser storage + refresh
  // timer would be another way state leaks across requests in a reused isolate).
  //
  // Typed with <Database> (the generated schema) so `.from('ai_settings')` and
  // the `consent` column are checked at compile time — a table/column typo is a
  // build error, not a silent runtime failure on the consent gate. Imported by
  // relative path because the worker tsconfig has no `@` alias; database.types
  // is type-only (no DOM), so no tsconfig.worker include change is needed.
  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError) {
    // 401/403 = the token itself was rejected (missing scope / expired /
    // revoked) → session expired. Any other status (Supabase unreachable / 5xx)
    // is an outage, not a bad token: rethrow so index.ts logs it and returns a
    // generic 500 (fail closed, no leak). Matched on status, never on message.
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
  // Read the user's own ai_settings row under RLS. `.eq('user_id', user.id)`
  // binds the read to the VERIFIED uid (belt-and-suspenders with RLS, and it
  // proves consent can't be spoofed via the body). `.maybeSingle()` returns
  // data=null (NOT an error) when there is no row — and "no row" means "never
  // opted in" = not consented. So: no row → 403, consent=false → 403,
  // consent=true → pass. A real DB error is rethrown → 500 (fail closed).
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

  // ── Gates 3-4 (rate limit + Anthropic) are PR-1b ─────────────────────────
  // Keep the existing "no key" 503, but AFTER auth/consent per the mandatory
  // order — an unauthenticated / non-consenting caller must never reach here.
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'AI ยังไม่ได้ตั้งค่า (ไม่มี ANTHROPIC_API_KEY ฝั่ง server)' }, 503)
  }

  // TODO(ai · PR-1b): rate limit (KV, keyed by verified uid) → forward to the
  // Anthropic Messages API with tool use. The endpoint still returns 501 today.
  return json({ error: 'ยังไม่เปิดใช้งานฟีเจอร์ AI' }, 501)
}
