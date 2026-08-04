/**
 * Read-only tools exposed to the model. v1 has exactly one: `wallet_balances`.
 *
 * Hard rule (design §3.4): a tool's schema must NOT let the model name whose
 * data to read. `wallet_balances()` is 0-arg + INVOKER, so it runs under the
 * caller's JWT and RLS scopes it to that user — the tool therefore takes no
 * parameters at all. Identity comes only from the verified token, never from
 * the model. Every tool here is read-only; nothing writes/updates/deletes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'

/** Tool definitions sent verbatim in the Anthropic request `tools` array. */
export const AI_TOOLS = [
  {
    name: 'wallet_balances',
    description:
      'คืนยอดคงเหลือปัจจุบันของกระเป๋าเงินแต่ละใบของผู้ใช้ (ยอดจากระบบ ไม่ต้องคำนวณเอง). ' +
      'ไม่รับพารามิเตอร์ใด ๆ — ระบบรู้เองว่าเป็นข้อมูลของผู้ใช้คนไหน.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
] as const

export interface ToolOutcome {
  /** JSON string placed in the tool_result content. */
  content: string
  /** true → tool_result carries is_error so the model degrades gracefully. */
  isError: boolean
}

/**
 * Execute one tool call under the user's RLS-scoped client. Never throws on a
 * data error — returns an is_error payload so the model answers "ตอบไม่ได้"
 * instead of the whole turn crashing (error still reaches the user via the
 * model, and no internal detail is leaked).
 */
export async function runTool(
  name: string,
  supabase: SupabaseClient<Database>,
): Promise<ToolOutcome> {
  if (name === 'wallet_balances') {
    const { data, error } = await supabase.rpc('wallet_balances')
    if (error) {
      return { content: JSON.stringify({ error: 'ดึงข้อมูลกระเป๋าไม่สำเร็จ' }), isError: true }
    }
    // Pass the RPC rows through UNCHANGED. `balance` is computed in SQL from
    // the raw `type` (design §4-14); the model must report it, not re-derive
    // it with any budget/spend logic (that path has burned the project before).
    return { content: JSON.stringify({ wallets: data ?? [] }), isError: false }
  }
  return { content: JSON.stringify({ error: `ไม่รู้จักเครื่องมือ: ${name}` }), isError: true }
}
