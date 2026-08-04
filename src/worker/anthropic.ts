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
import type { HistoryTurn } from './history'
import { AI_TOOLS, runTool, type ToolContext } from './tools'

/**
 * Single source of truth for the model id.
 *
 * ⚠️ OWNER MUST CONFIRM before enabling. `claude-sonnet-5` is a real, current
 * Anthropic model (verified against the Anthropic model catalogue).
 *
 * WHY we moved off `claude-haiku-4-5` (the previous, cheapest tier): tested
 * against the known-answer dataset (supabase/seeds/), Haiku kept BREAKING the
 * SYSTEM_PROMPT's first rule ("พูดได้เฉพาะตัวเลขที่ได้จากผลของ tool") — it
 * invented a lifetime-profit figure no tool returns, mis-explained why budget
 * ≠ headline, and answered a category question by summing the month itself
 * instead of using the tool's category filter (dangerous: it silently
 * under-reports once a month exceeds AI_ROW_CAP). Those are "instruction not
 * followed" failures, not "instruction not given" — so the fix is a more
 * capable model, not a longer prompt. This is a single-variable change: only
 * the model id moves, so any behaviour delta is attributable to it alone.
 *
 * COST, on purpose: Sonnet is several× Haiku PER TOKEN ($3/$15 vs $1/$5 per 1M
 * input/output), and every turn now re-sends the whole history (PR AI-A), so
 * cost per conversation grows on both axes. Accepted as the price of correct
 * answers; if quality holds, drop back down — that is the owner's call, not a
 * silent default. The spend ceilings (AI_MAX_TOKENS / AI_MAX_MODEL_CALLS /
 * AI_MAX_HISTORY_* / the rate limit) are unchanged by this ticket.
 */
export const ANTHROPIC_MODEL = 'claude-sonnet-5'
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
/**
 * Max itemised rows any list-returning tool may hand back (design §4.1). Chosen
 * from the model's token budget, not a DB limit: 50 rows keeps the tool result
 * small. On overflow the tool sets capped:true + the true count (from an
 * aggregate) and the prompt makes the model tell the user it's partial.
 */
export const AI_ROW_CAP = 50

/**
 * History cost ceilings. The Messages API is stateless, so the ENTIRE
 * conversation history is re-sent on every turn → input cost grows with chat
 * length. These are COST ceilings, not just a UX nicety — tune spend here, in
 * one place. Enforced by sanitizeHistory (worker/history.ts), which drops the
 * oldest turns first when either is exceeded.
 */
export const AI_MAX_HISTORY_TURNS = 12 // = 6 question/answer pairs
export const AI_MAX_HISTORY_CHARS = 8000 // summed across every turn

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

/**
 * The behaviour rules, sent ONCE per call (unlike tool schemas, which re-ship
 * every loop turn — so detail belongs here, not in the schemas). Every line is
 * load-bearing; see the design doc §4 / §7.1 / §6 and STASH_CONTEXT §11.4-6.
 */
const SYSTEM_PROMPT = [
  'คุณเป็น "ผู้ช่วยการเงิน" ของแอป Stash ตอบผู้ใช้เป็นภาษาไทย สั้น กระชับ ตรงคำถาม',
  '',
  'หลักการตอบ (เด็ดขาด):',
  '- ห้ามคำนวณยอดเงินหรือวันที่เอง พูดได้เฉพาะตัวเลขที่ได้จากผลของเครื่องมือ (tool) เท่านั้น',
  '- บอกที่มาของตัวเลขเสมอ เช่น "จากยอดคงเหลือกระเป๋า" หรือ "จากสรุปเดือน 2026-07"',
  '- ถ้าไม่มีเครื่องมือที่ตอบคำถามนั้นได้ ให้บอกตรง ๆ ว่ายังตอบไม่ได้ ห้ามเดา ห้ามแต่งตัวเลข',
  '- อ้างถึงได้เฉพาะสิ่งที่มีจริงในแอป ห้ามแต่งชื่อหน้าจอ/แท็บ/เมนู/ฟีเจอร์ที่ไม่รู้ว่ามีจริง',
  '  (เช่น อย่าบอกว่า "ดูที่แท็บรายงาน" ถ้าไม่รู้ว่ามีจริง) ถ้าจะชี้ทางให้พูดกว้าง ๆ หรือไม่พูด',
  '',
  'เรื่องหมวด:',
  '- ถ้าคำถามอ้างถึงหมวด ให้ส่งชื่อหมวดที่ผู้ใช้พูด (เช่น "ค่าอาหาร") ไปที่พารามิเตอร์ category ระบบจะหาหมวดให้เอง',
  '- ถ้าผลของเครื่องมือมี needs_clarification (เจอหลายหมวดใกล้เคียง) ให้ถามผู้ใช้กลับว่าหมายถึงหมวดไหน ห้ามเดาเลือกเอง',
  '- ถ้ามี category_not_found ให้บอกว่าไม่พบหมวดนั้น (จะเสนอดูยอดรวมทุกหมวดแทนก็ได้)',
  '',
  'เรื่องเดือน:',
  '- ส่งเดือนเป็น offset จำนวนเต็มเท่านั้น: 0=เดือนนี้ -1=เดือนที่แล้ว -2=สองเดือนก่อน',
  '  ห้ามส่งวันที่หรือชื่อเดือนเป็นข้อความ ระบบจะแปลงเป็นเดือนจริงให้เอง',
  '',
  'ความหมายของตัวเลข (อย่าปนกัน):',
  '- "จ่าย" จาก month_spending = เงินสดออกรวมของเดือน (ยกเว้นซื้อเข้าสต็อก) เป็นยอด headline ไม่ใช่ "ยอดที่นับในงบ"',
  '- ถามว่าเดือนนั้น "ซื้อเข้าสต็อก/รับของเข้าคลัง อะไรบ้าง กี่ชิ้น ราคาเท่าไหร่" ใช้ stock_intake (ไม่ใช่ month_spending ที่ตัดการซื้อเข้าสต็อกออก)',
  '- budget_spending จาก home_summary = ยอดที่นับในงบจริง (ตัดต้นทุนขาย/เคลียร์ยอด/ค่าดำเนินร้านออก)',
  '- safe_to_spend = รับ−จ่ายของเดือนนี้ ไม่ใช่ "เงินคงเหลือในกระเป๋าทั้งหมด" (คนละอย่าง)',
  '- ยอดคงเหลือกระเป๋าดูจาก wallet_balances',
  '',
  'เมื่อรายการถูกจำกัด:',
  '- ถ้าผลมี capped:true แปลว่าแสดงบางส่วน (สูงสุด 50) จากทั้งหมด count รายการ ต้องบอกผู้ใช้ว่าเป็นบางส่วน',
  '  และแนะให้ระบุช่วง/หมวดให้แคบลงถ้าอยากเห็นครบ · ยอดรวม (total_income/total_expense) ถูกต้องเสมอแม้รายการไม่ครบ',
  '',
  'ห้ามเด็ดขาด: ห้ามพูดถึงยอดค้าง เพื่อน หรือใช้คำว่า หนี้ เจ้าหนี้ ลูกหนี้ ทวง เรียกเก็บ',
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
  /** Prior conversation turns, ALREADY parsed + sanitised by ai.ts. Ownership is
   *  deliberate: every validation / security gate already lives in ai.ts, so it
   *  owns parseHistory + sanitizeHistory and we receive clean data here. We do
   *  NOT sanitise again — the logic must live in exactly one place (convention
   *  11). Default `[]` keeps single-question callers (and every existing test)
   *  behaving exactly as before. */
  history?: HistoryTurn[]
  /** Injectable clock (ms). Defaults to Date.now; tests pass a fake so the
   *  shared-deadline path is deterministic. */
  now?: () => number
}): Promise<string> {
  const { question, apiKey, supabase } = opts
  const history = opts.history ?? []
  const now = opts.now ?? Date.now
  // Capture the shared deadline ONCE, up front — every call this request makes
  // must finish before it (see AI_REQUEST_DEADLINE_MS above for why per-call
  // timeouts aren't enough).
  const deadlineAt = now() + AI_REQUEST_DEADLINE_MS
  // "today" for month/offset/age logic, captured once (a request doesn't span a
  // day boundary). Bangkok reckoning happens inside dates.ts.
  const ctx: ToolContext = { supabase, nowDate: new Date(now()), rowCap: AI_ROW_CAP }
  // Prior turns (already clean) first, then the new question. The tool-use loop
  // below keeps pushing onto this same array, so it just continues from here.
  const messages: Turn[] = [
    ...history.map((h) => ({ role: h.role, content: h.text })),
    { role: 'user', content: question },
  ]

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
      const outcome = await runTool(block.name ?? '', block.input, ctx)
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
