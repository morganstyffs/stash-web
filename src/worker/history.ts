/**
 * Conversation-history parsing + sanitising for /api/ai — PURE functions, no I/O.
 *
 * Split into its own file (same pattern as rateLimit.ts) so the validate / trim /
 * role-fixing logic is unit-testable directly, with no Anthropic or Supabase stub
 * and no casts (convention 12).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 SECURITY — this is the whole reason parseHistory is an ALLOWLIST, not a
 * denylist. History arrives FROM THE CLIENT, so a user can forge its contents.
 * The blast radius is mostly nil (they only fool themselves — identity still
 * comes from the verified token, and every tool still runs under RLS) EXCEPT for
 * one thing that is NOT acceptable:
 *
 *   We must never accept a client-supplied `tool_use` / `tool_result` block, or
 *   any content-block array, in the history. If we did, a user could inject a
 *   fabricated `tool_result` with made-up numbers, and the model would present
 *   them as if they came from a real tool call against the database — destroying
 *   the single rule the entire feature stands on ("speak only numbers that came
 *   from a tool result" — SYSTEM_PROMPT line 1).
 *
 * Therefore we accept ONLY `{ role: 'user' | 'assistant', text: string }` where
 * `text` is a plain string. Anything else — extra keys, a `type` / `content` /
 * `tool_use_id` / `input` field (the shape of an Anthropic content block), a
 * non-string `text` — is rejected. We reject on SHAPE, before ever inspecting a
 * value. This is an allowlist: if it is not exactly the shape above, refuse.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ChatTurn } from '../lib/aiChat'

/**
 * A single prior turn. Structurally identical to the client's `ChatTurn`; the
 * type is declared once in ../lib/aiChat (client tsconfig) and re-exported here
 * so the shape never lives in two places (convention 11 / 24). The import is
 * type-only, so the worker bundle never pulls in client code.
 */
export type HistoryTurn = ChatTurn

/**
 * Caps applied by sanitizeHistory. Passed IN (not read from anthropic.ts inside
 * this file) so the module stays pure and tests can pick their own small numbers.
 */
export interface HistoryCaps {
  maxTurns: number
  maxChars: number
}

const ALLOWED_ROLES = new Set(['user', 'assistant'])

/**
 * Validate raw, client-supplied history.
 *   - `undefined` / missing key → `[]`   (history is optional; old clients still work)
 *   - not an array              → `null` (malformed → caller replies 400)
 *   - ANY element off-shape     → `null` (reject the WHOLE set)
 *
 * Why "malformed = reject everything", not "skip the broken turn": the only
 * client that calls this endpoint is our own app, so a malformed turn is OUR
 * bug — it must surface as a 400, not be silently papered over (same family as
 * "an error must reach the user, never an empty catch" — convention 15).
 */
export function parseHistory(raw: unknown): HistoryTurn[] | null {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) return null

  const out: HistoryTurn[] = []
  for (const el of raw) {
    if (!el || typeof el !== 'object' || Array.isArray(el)) return null
    // Allowlist BY SHAPE: exactly the keys `role` and `text`, nothing more. An
    // Anthropic content block (type / content / tool_use_id / input, etc.) has
    // other keys and is rejected right here — see the security note at the top.
    const keys = Object.keys(el)
    if (keys.length !== 2 || !keys.includes('role') || !keys.includes('text')) return null
    const { role, text } = el as { role: unknown; text: unknown }
    if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) return null
    if (typeof text !== 'string') return null
    if (text.trim() === '') return null // an empty bubble carries no meaning
    out.push({ role: role as 'user' | 'assistant', text })
  }
  return out
}

/**
 * Clean a parsed history into something safe to prepend to the Messages API
 * request. Returns a NEW array and never mutates `turns`. Four steps, IN ORDER:
 *
 *  1. Enforce alternating roles. History precedes the new question (a `user`
 *     turn), so it must END in `assistant`. Keep the newest run that alternates
 *     and ends in assistant: skip any trailing non-assistant turns, then walk
 *     older while roles strictly alternate, dropping everything past the break.
 *     🔴 This is not hypothetical: on a FAILED request AiPage deliberately keeps
 *     the question in the transcript (so the user sees what failed), so the next
 *     send's history can end in two `user` turns in a row — which the Messages
 *     API rejects. We fix it HERE, not by hoping the client won't send it.
 *  2. Keep only the newest `maxTurns` turns (drop the oldest first).
 *  3. Drop the oldest turns until the total `text` length is ≤ `maxChars`.
 *  4. If the result now starts with `assistant` (steps 2/3 can trim the head to
 *     an odd count), drop that first turn — the Messages API must start with
 *     `user`.
 */
export function sanitizeHistory(turns: HistoryTurn[], caps: HistoryCaps): HistoryTurn[] {
  // Step 1 — keep the newest alternating run that ends in 'assistant'.
  let end = turns.length - 1
  while (end >= 0 && turns[end].role !== 'assistant') end-- // skip trailing non-assistant (e.g. a failed question)
  if (end < 0) return [] // nothing usable (no assistant turn at all)
  let start = end
  while (start - 1 >= 0 && turns[start - 1].role !== turns[start].role) start--
  let result = turns.slice(start, end + 1)

  // Step 2 — cap the turn count, dropping the oldest.
  if (result.length > caps.maxTurns) {
    result = result.slice(result.length - caps.maxTurns)
  }

  // Step 3 — cap total characters, dropping the oldest until it fits.
  let total = result.reduce((n, t) => n + t.text.length, 0)
  let from = 0
  while (from < result.length && total > caps.maxChars) {
    total -= result[from].text.length
    from++
  }
  if (from > 0) result = result.slice(from)

  // Step 4 — the Messages API must start with 'user'.
  if (result.length > 0 && result[0].role === 'assistant') {
    result = result.slice(1)
  }

  return result
}
