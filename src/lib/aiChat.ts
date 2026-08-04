/**
 * Client side of `POST /api/ai`. The Worker (`src/worker/ai.ts`) is the source of
 * truth for the request/response contract — read there, don't guess:
 *
 *   • request  — POST, `Authorization: Bearer <session.access_token>`, JSON body
 *                `{ message: string }`. Identity is taken ONLY from the verified
 *                token; the body carries the question and nothing that names a user.
 *   • success  — 200 `{ reply: string }`.
 *   • failure  — `{ error: <Thai> }` at an HTTP status the Worker chose:
 *                401 session expired · 403 assistant not enabled (consent) ·
 *                429 rate limited · 502/504 assistant unavailable ·
 *                400 empty question · 503 misconfigured.
 *
 * Failures are surfaced by STATUS, never by matching message substrings (§5 /
 * convention 15): `askAssistant` throws an `AiHttpError` carrying `{ status,
 * message }`, and the caller runs it through `translateError` (errors.ts — the one
 * error-mapping authority, so the mapping is not duplicated here). translateError
 * returns the Worker's Thai line verbatim (its rule 1: a message already in Thai is
 * passed through) and, if a body ever arrives WITHOUT one (e.g. a Cloudflare edge
 * 502 HTML page), falls back to its own status-keyed mapping (429 → rate-limit,
 * 502/504/503 → connect-failure). A network failure (fetch itself rejects) has no
 * status and flows straight to translateError's `isConnectFailure`.
 *
 * There is no empty catch anywhere: every failure path ends at a thrown error the
 * caller turns into a visible Thai message.
 */

/**
 * One prior conversation turn, sent back with the next question so the assistant
 * has context (multi-turn). Structurally identical to the Worker's `HistoryTurn`
 * — the type is declared HERE (client tsconfig) and imported by the Worker via a
 * relative path (`worker/history.ts` → `../lib/aiChat`), never the other way, so
 * the Worker bundle never pulls in client-only code (convention 24). This file
 * imports nothing, which is what makes that safe.
 *
 * ONLY `{ role, text }` with a plain-string `text` — never a `tool_use` /
 * `tool_result` / content-block shape. The Worker enforces that allowlist on the
 * wire (see worker/history.ts for why it is load-bearing); this type just keeps
 * the client honest about what it sends.
 */
export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

/** An HTTP-level failure from `/api/ai`, tagged with the real status so the mapping
 *  in errors.ts is status-driven. `message` is the Worker's Thai `error` string
 *  when present (passed through by translateError), or '' for a non-JSON edge body
 *  (the status still routes to the right line). */
export class AiHttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'AiHttpError'
    this.status = status
  }
}

/** Ask the assistant one question, optionally with the prior conversation so it has
 *  context (multi-turn). Resolves to the Thai reply text, or rejects with an
 *  `AiHttpError` (HTTP failure) / the raw fetch rejection (offline) — both of which
 *  `translateError` turns into a Thai message for the user. */
export async function askAssistant(
  question: string,
  accessToken: string,
  history: ChatTurn[] = [],
): Promise<string> {
  // A network error (offline / DNS / TLS) rejects here with a fetch TypeError that
  // carries no status; let it propagate untouched so translateError.isConnectFailure
  // recognises it. Everything after this line is an HTTP response we DID receive.
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Fresh token from the live session, never cached by us (§2). The caller
      // reads it from useAuth at send time.
      Authorization: `Bearer ${accessToken}`,
    },
    // Identity is still taken ONLY from the token; the body carries the question
    // and, when there is one, the prior transcript — nothing that names a user.
    // Send `history` only when non-empty so an old client / fresh chat stays
    // byte-for-byte the old `{ message }` shape.
    body: JSON.stringify(history.length ? { message: question, history } : { message: question }),
  })

  if (!res.ok) {
    // Read the Worker's Thai `{ error }`. Carry the real HTTP status so the mapping
    // is by status, not by parsing the text.
    let message = ''
    try {
      const body: unknown = await res.json()
      if (
        body &&
        typeof body === 'object' &&
        typeof (body as { error?: unknown }).error === 'string'
      ) {
        message = (body as { error: string }).error
      }
    } catch {
      // Non-JSON body (an edge error page, not the Worker's JSON). Leave the message
      // empty and let the status drive translateError — NOT a swallow: the throw
      // below always reaches the user.
    }
    throw new AiHttpError(res.status, message)
  }

  const data: unknown = await res.json()
  if (
    data &&
    typeof data === 'object' &&
    typeof (data as { reply?: unknown }).reply === 'string'
  ) {
    return (data as { reply: string }).reply
  }
  // 200 but not the `{ reply }` shape — treat as the assistant being unavailable
  // rather than rendering an empty bubble. No Thai body → translateError's fallback.
  throw new AiHttpError(res.status, '')
}
