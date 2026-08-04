/**
 * Server-to-server call to the Anthropic Messages API + the bounded tool-use
 * loop. This is the ONLY place the ANTHROPIC_API_KEY is used, and it is never
 * put in a response, a log, or an error — a failure surfaces as a generic Thai
 * message mapped to 502/504 by the caller.
 *
 * The browser must NEVER call api.anthropic.com directly (that would leak the
 * key and require opening the CSP). Keep it here, server side (design §5).
 *
 * ── Cost ceilings (the four numbers that bound spend per request) ────────────
 * If any of these is missing the endpoint becomes an unbounded money sink, so
 * they are all enforced:
 *   ANTHROPIC_MODEL        — which model (price tier)
 *   AI_MAX_TOKENS          — max output tokens per call
 *   AI_MAX_MODEL_CALLS     — max calls per request (caps the tool-use loop)
 *   AI_TIMEOUT_MS          — per-call wall-clock ceiling (AbortSignal.timeout)
 *   AI_REQUEST_DEADLINE_MS — total wall-clock ceiling for the whole request
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { AI_TOOLS, runTool } from './tools'

/**
 * Single source of truth for the model id.
 *
 * ⚠️ OWNER MUST CONFIRM before enabling. `claude-haiku-4-5` is a real, current
 * Anthropic model (verified against the Anthropic model catalogue), chosen for
 * COST: a few users asking short Thai questions over a couple of read-only
 * tools. It is the cheapest current tier ($1/$5 per 1M input/output tokens).
 * Raise to a stronger model (e.g. `claude-sonnet-5`, `claude-opus-5`) if answer
 * quality is not good enough — that is the owner's call, not a silent default.
 */
export const ANTHROPIC_MODEL = 'claude-haiku-4-5'
/** Max output tokens per call. Answers are short; this caps per-call cost. */
export const AI_MAX_TOKENS = 1024
/** Max Anthropic calls per user request. Caps the tool-use loop so the model
 *  can never loop tools forever and burn money. Normal flow uses 2 (one to
 *  pick a tool, one to answer). */
export const AI_MAX_MODEL_CALLS = 3
/** Per-call wall-clock ceiling. A hung upstream can't pin one call open. */
export const AI_TIMEOUT_MS = 30_000
/**
 * Total wall-clock ceiling for the WHOLE request (all calls combined). This is
 * NOT redundant with AI_TIMEOUT_MS: the per-call timeout bounds one call, but
 * AI_MAX_MODEL_CALLS of them back-to-back could still pin the user's request
 * open for ~AI_MAX_MODEL_CALLS × AI_TIMEOUT_MS (~90s) — far too long for
 * someone waiting on screen. This is the shared budget across all calls; do NOT
 * delete it as a duplicate of the per-call timeout, they bound different things.
 */
export const AI_REQUEST_DEADLINE_MS = 45_000
/**
 * If less than this remains of the shared budget, stop instead of firing a call
 * that almost certainly can't finish a model turn in time — it would only waste
 * a round-trip and delay the 504.
 */
const AI_MIN_CALL_BUDGET_MS = 2_000

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

/** Minimal rules this ticket can enforce (full prompt = PR-2b). Thai only,
 *  numbers only from tools, cite the source, no guessing, no debts/friends,
 *  and none of the on-screen forbidden words (convention 19). */
const SYSTEM_PROMPT = [
  'คุณเป็นผู้ช่วยการเงินของแอป Stash ตอบเป็นภาษาไทย สั้น กระชับ',
  'กติกาเด็ดขาด:',
  '- ห้ามคำนวณยอดเงินหรือวันที่เอง ใช้เฉพาะตัวเลขที่ได้จากเครื่องมือ (tool) เท่านั้น',
  '- บอกที่มาของตัวเลขเสมอ (เช่น "จากยอดคงเหลือกระเป๋า")',
  '- ถ้าไม่มีเครื่องมือที่ตอบคำถามได้ ให้บอกว่ายังตอบไม่ได้ ห้ามเดา',
  '- ห้ามพูดถึงยอดค้าง เพื่อน หนี้ เจ้าหนี้ ลูกหนี้ การทวง หรือการเรียกเก็บ',
  'เครื่องมือที่ใช้ได้ตอนนี้: wallet_balances (ยอดคงเหลือแต่ละกระเป๋า)',
].join('\n')

/** Thrown on any upstream problem; carries only a coarse kind (no raw detail). */
export class AnthropicError extends Error {
  constructor(public readonly kind: 'timeout' | 'upstream') {
    super(kind)
    this.name = 'AnthropicError'
  }
}

interface ContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
}
interface AnthropicMessage {
  stop_reason?: string
  content?: ContentBlock[]
}
type Turn = { role: 'user' | 'assistant'; content: unknown }

const FALLBACK_REPLY = 'ยังตอบไม่ได้ในตอนนี้ ลองถามใหม่อีกครั้ง'

/**
 * Run one user question through the model, executing tools under the user's
 * RLS-scoped client, and return the assistant's Thai text. Loops at most
 * AI_MAX_MODEL_CALLS times; on hitting the cap it STOPS (no further calls) and
 * returns a fallback — it never keeps looping.
 */
export async function runAssistant(opts: {
  question: string
  apiKey: string
  supabase: SupabaseClient<Database>
  /** Injectable clock (ms). Defaults to Date.now; tests pass a fake so the
   *  shared-deadline path is deterministic. */
  now?: () => number
}): Promise<string> {
  const { question, apiKey, supabase } = opts
  const now = opts.now ?? Date.now
  // Capture the shared deadline ONCE, up front — every call this request makes
  // must finish before it (see AI_REQUEST_DEADLINE_MS above for why per-call
  // timeouts aren't enough).
  const deadlineAt = now() + AI_REQUEST_DEADLINE_MS
  const messages: Turn[] = [{ role: 'user', content: question }]

  for (let call = 0; call < AI_MAX_MODEL_CALLS; call++) {
    const res = await callAnthropic(apiKey, messages, deadlineAt, now)
    const content = res.content ?? []

    if (res.stop_reason !== 'tool_use') {
      return extractText(content) || FALLBACK_REPLY
    }

    // Model asked for tools. Echo its turn back verbatim, run each tool under
    // the user's JWT, and feed results back for the next call.
    messages.push({ role: 'assistant', content })
    const toolResults = []
    for (const block of content) {
      if (block.type !== 'tool_use') continue
      const outcome = await runTool(block.name ?? '', supabase)
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: outcome.content,
        is_error: outcome.isError,
      })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  // Hit the call cap while still asking for tools → stop. Do NOT call again.
  return FALLBACK_REPLY
}

async function callAnthropic(
  apiKey: string,
  messages: Turn[],
  deadlineAt: number,
  now: () => number,
): Promise<AnthropicMessage> {
  // Stop before firing a call the shared budget can't afford. Mapped to 504.
  const remaining = deadlineAt - now()
  if (remaining < AI_MIN_CALL_BUDGET_MS) {
    throw new AnthropicError('timeout')
  }
  // This call gets whichever is smaller: its own per-call ceiling, or whatever
  // is left of the shared request budget.
  const timeoutMs = Math.min(AI_TIMEOUT_MS, remaining)
  let res: Response
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: AI_MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
        tools: AI_TOOLS,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    // AbortSignal.timeout aborts with a TimeoutError DOMException; a dropped
    // connection is an AbortError/other. Classify by name, not by message.
    const name = err instanceof Error ? err.name : ''
    throw new AnthropicError(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'upstream')
  }
  if (!res.ok) {
    // Non-2xx (overload 529 / 5xx / auth / rate). Never surface the raw body.
    throw new AnthropicError(res.status === 408 || res.status === 504 ? 'timeout' : 'upstream')
  }
  return (await res.json()) as AnthropicMessage
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim()
}
