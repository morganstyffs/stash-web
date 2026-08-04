/**
 * Read-only tools exposed to the model, plus their execution under the user's
 * RLS-scoped client. Everything here is READ-ONLY — nothing writes/updates/
 * deletes, and nothing touches debts/friends/profiles (design §6).
 *
 * Two hard rules (design §3.4 / §4):
 *  - A tool's schema must NOT let the model name whose data to read. RPCs are
 *    0-arg or 4-arg-without-identity + INVOKER, so RLS scopes them to the caller.
 *    Identity comes only from the verified token, never from the model.
 *  - The model never sends a date string — only an integer `offset` (0 = this
 *    month, -1 = last month). The worker converts it to YYYY-MM with dates.ts
 *    (Asia/Bangkok). "Model picks intent, code computes the range."
 *
 * Money/day logic is NEVER re-implemented here (convention 11 / §4-14 trap): the
 * worker calls the existing RPC or the pure lib/ function and passes the number
 * through. Descriptions are kept SHORT — the schema is re-sent every loop turn;
 * detail the model needs lives in the system prompt (sent once).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { addMonthsToKey, daysSince, monthAnchorFromKey, monthBoundsFromKey, monthKey } from '../lib/dates'
import { formatMonthLong } from '../lib/format'
import { computeHomeSummary } from '../lib/homeSummary'
import { computeSunkCost, inStock, isStale } from '../lib/stockAge'
import { resolveCategory } from './categories'

// ── tool definitions (sent verbatim as the Anthropic `tools` array) ──────────
const OFFSET_PROP = {
  type: 'integer',
  description: 'เดือนแบบ offset จำนวนเต็ม: 0=เดือนนี้ -1=เดือนที่แล้ว (ห้ามส่งวันที่)',
} as const

export const AI_TOOLS = [
  {
    name: 'wallet_balances',
    description: 'ยอดคงเหลือปัจจุบันของแต่ละกระเป๋าเงิน พร้อมชื่อกระเป๋า ไม่รับพารามิเตอร์',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'month_spending',
    description:
      'ยอดรับ/จ่ายรวมของเดือน (จ่าย = เงินสดออก ยกเว้นซื้อเข้าสต็อก) และรายการ (สูงสุด 50) กรองตามหมวดได้',
    input_schema: {
      type: 'object',
      properties: {
        offset: OFFSET_PROP,
        category: { type: 'string', description: 'ชื่อหมวดที่ผู้ใช้พูด เช่น "ค่าอาหาร" (จะให้ระบบหาหมวดให้)' },
        filter: { type: 'string', enum: ['all', 'income', 'expense', 'stock'], description: 'ค่าเริ่มต้น expense' },
      },
      required: ['offset'],
      additionalProperties: false,
    },
  },
  {
    name: 'home_summary',
    description: 'สรุปการเงินของเดือน: รับ/จ่าย/เหลือใช้/ยอดในงบ/วันเหลือ/หมวดใหญ่',
    input_schema: {
      type: 'object',
      properties: { offset: OFFSET_PROP },
      required: ['offset'],
      additionalProperties: false,
    },
  },
  {
    name: 'stock_sales',
    description: 'ยอดขายสต็อกของเดือน: รายได้/ต้นทุนขาย/กำไร/จำนวนชิ้น',
    input_schema: {
      type: 'object',
      properties: { offset: OFFSET_PROP },
      required: ['offset'],
      additionalProperties: false,
    },
  },
  {
    name: 'stock_intake',
    description: 'รายการที่ซื้อเข้าสต็อกในเดือน: ชื่อสินค้า/จำนวนที่รับเข้า/ราคาต่อหน่วย (สูงสุด 50)',
    input_schema: {
      type: 'object',
      properties: { offset: OFFSET_PROP },
      required: ['offset'],
      additionalProperties: false,
    },
  },
  {
    name: 'stale_stock',
    description: 'ของค้างในสต็อก: ค้างนานสุดกี่วัน จำนวนที่ค้างนาน และทุนจม ไม่รับพารามิเตอร์',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
] as const

export interface ToolContext {
  supabase: SupabaseClient<Database>
  /** "today" as a Date (Bangkok reckoning happens inside dates.ts). Injected for tests. */
  nowDate: Date
  /** max itemised rows a list-returning tool may include (design §4.1). */
  rowCap: number
}

export interface ToolOutcome {
  /** JSON string placed in the tool_result content. */
  content: string
  /** true → tool_result carries is_error so the model degrades gracefully. */
  isError: boolean
}

const ok = (payload: unknown): ToolOutcome => ({ content: JSON.stringify(payload), isError: false })
const fail = (message: string): ToolOutcome => ({
  content: JSON.stringify({ error: message }),
  isError: true,
})

// Cap on how many rows a raw-row fetch reads before we refuse to summarise. A
// silently-truncated aggregate would under-report money (design §9 trap), so if
// a fetch hits this we tell the user instead of returning a wrong total. Set far
// above a small reseller's real volume.
const RAW_ROW_MAX = 2000

type TxFilter = 'all' | 'income' | 'expense' | 'stock'

function asObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
}

/** Integer month offset, clamped to [-1200, 0] (no future, ~100y back). Default 0. */
function readOffset(input: unknown): number {
  const v = asObject(input).offset
  if (typeof v === 'number' && Number.isInteger(v)) return Math.min(0, Math.max(-1200, v))
  return 0
}

function readFilter(input: unknown): TxFilter {
  const v = asObject(input).filter
  if (v === 'all' || v === 'income' || v === 'expense' || v === 'stock') return v
  return 'expense'
}

function readCategory(input: unknown): string {
  const v = asObject(input).category
  return typeof v === 'string' ? v.trim() : ''
}

/** Dispatch one tool call. Never throws on a data error — returns is_error so
 *  the model answers "ตอบไม่ได้" instead of crashing the turn. */
export async function runTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  switch (name) {
    case 'wallet_balances':
      return walletBalances(ctx)
    case 'month_spending':
      return monthSpending(input, ctx)
    case 'home_summary':
      return homeSummary(input, ctx)
    case 'stock_sales':
      return stockSales(input, ctx)
    case 'stock_intake':
      return stockIntake(input, ctx)
    case 'stale_stock':
      return staleStock(ctx)
    default:
      return fail(`ไม่รู้จักเครื่องมือ: ${name}`)
  }
}

async function walletBalances(ctx: ToolContext): Promise<ToolOutcome> {
  const { data: balances, error } = await ctx.supabase.rpc('wallet_balances')
  if (error) return fail('ดึงข้อมูลกระเป๋าไม่สำเร็จ')
  // wallet_balances() returns wallet_id (uuid) only; join names from `wallets`
  // (same RLS) so the model says "เงินสด/ธนาคาร", not "กระเป๋าที่ 2". Never
  // invent a name — if the join misses, send null.
  const { data: wallets, error: wErr } = await ctx.supabase.from('wallets').select('id, name')
  if (wErr) return fail('ดึงข้อมูลกระเป๋าไม่สำเร็จ')
  const nameById = new Map((wallets ?? []).map((w) => [w.id, w.name]))
  const rows = (balances ?? []).map((b) => ({
    name: nameById.get(b.wallet_id) ?? null,
    balance: b.balance, // straight from the RPC (raw `type`, §4-14) — do not recompute
  }))
  return ok({ wallets: rows })
}

/**
 * Human-readable Buddhist-era month label for a 'YYYY-MM' key, e.g. "กรกฎาคม 2569".
 * The model shows THIS to the user (never the raw key). We keep the raw `month`
 * key in the payload too — the model may need it to compare months internally.
 * Goes through lib/format's formatMonthLong (one source of truth for the Thai
 * month name — convention 11) and monthAnchorFromKey, never `new Date('YYYY-MM-01')`
 * which parses as UTC and can shift the month (convention 17).
 */
function monthLabel(key: string): string {
  return formatMonthLong(monthAnchorFromKey(key))
}

async function monthSpending(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const offset = readOffset(input)
  const month = addMonthsToKey(monthKey(ctx.nowDate), offset)
  const filter = readFilter(input)
  const rawCategory = readCategory(input)

  let categoryId = '' // '' → all categories (0024: empty → no category filter)
  let categoryName: string | null = null
  if (rawCategory) {
    const r = await resolveCategory(ctx.supabase, rawCategory)
    if (r.status === 'error') return fail('อ่านหมวดไม่สำเร็จ')
    // Ambiguous / not-found are NOT errors — hand the situation to the model so
    // it asks back / says not found, never guesses (design §7.1).
    if (r.status === 'ambiguous') {
      return ok({ needs_clarification: true, asked_for: rawCategory, options: r.names })
    }
    if (r.status === 'none') return ok({ category_not_found: true, asked_for: rawCategory })
    categoryId = r.id
    categoryName = r.name
  }

  const { data, error } = await ctx.supabase.rpc('transactions_search', {
    p_filter: filter,
    p_q: '',
    p_month: month,
    p_category_id: categoryId,
    p_limit: ctx.rowCap, // itemised list is capped…
    p_offset: 0,
  })
  if (error) return fail('ดึงรายการไม่สำเร็จ')

  const rows = data ?? []
  // match_* are window aggregates computed after WHERE, BEFORE limit — so the
  // totals are correct even when the itemised list is capped (design §4.1).
  const agg = rows[0]
  const totalCount = agg ? agg.match_count : 0
  const items = rows.map((r) => ({
    date: r.date,
    amount: r.amount,
    category: r.category_name,
    note: r.note,
    type: r.type,
  }))
  return ok({
    month,
    month_label: monthLabel(month), // human label the model shows; raw key stays too
    category: categoryName, // resolved name, or null = all categories
    filter,
    total_income: agg ? agg.match_income : 0,
    total_expense: agg ? agg.match_expense : 0, // cash-out headline (isSpendingRow), NOT budget
    count: totalCount,
    items,
    capped: totalCount > items.length,
  })
}

async function homeSummary(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const offset = readOffset(input)
  const month = addMonthsToKey(monthKey(ctx.nowDate), offset)
  const b = monthBoundsFromKey(month)

  const { data: rows, error } = await ctx.supabase
    .from('transactions')
    .select('amount, type, date, category_id, is_stock_purchase, is_stock_cogs, is_debt_settlement, is_shop_operating')
    .gte('date', b.start)
    .lt('date', b.next)
    .limit(RAW_ROW_MAX)
  if (error) return fail('ดึงข้อมูลสรุปไม่สำเร็จ')
  if ((rows ?? []).length >= RAW_ROW_MAX) {
    // Would aggregate an incomplete set → refuse rather than under-report (§9).
    return ok({ month, month_label: monthLabel(month), too_many_transactions: true })
  }

  const { data: cats, error: cErr } = await ctx.supabase.from('categories').select('*')
  if (cErr) return fail('ดึงหมวดไม่สำเร็จ')

  // Reuse the exact home-screen aggregation (§4-14 predicates live inside it).
  const s = computeHomeSummary(rows ?? [], cats ?? [], month, ctx.nowDate)
  return ok({
    month,
    month_label: monthLabel(month), // human label the model shows; raw key stays too
    income: s.income,
    expense_headline: s.expense, // cash out (isSpendingRow)
    budget_spending: s.budgetSpending, // ยอดที่นับในงบ (COGS/settlement/shop-op excluded)
    safe_to_spend: s.safeToSpend, // income − expense — NOT wallet balance (§11.4-6)
    days_left: s.daysLeft,
    daily_allowance: s.dailyAllowance,
    top_categories: s.donut.slice(0, 8).map((d) => ({ name: d.name, total: d.total })),
  })
}

async function stockSales(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const offset = readOffset(input)
  const month = addMonthsToKey(monthKey(ctx.nowDate), offset)
  const b = monthBoundsFromKey(month) // start inclusive, next exclusive
  const { data, error } = await ctx.supabase.rpc('stock_sales_summary', {
    p_from: b.start,
    p_to: b.next,
  })
  if (error) return fail('ดึงยอดขายไม่สำเร็จ')
  const s = (data ?? [])[0]
  return ok({
    month,
    month_label: monthLabel(month), // human label the model shows; raw key stays too
    revenue: s ? s.revenue : 0,
    cogs: s ? s.cogs : 0,
    profit: s ? s.profit : 0, // ถัง1 − ถัง2 from the RPC — never spread per item
    qty_sold: s ? s.qty_sold : 0,
    sale_count: s ? s.sale_count : 0,
  })
}

async function stockIntake(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const offset = readOffset(input)
  const month = addMonthsToKey(monthKey(ctx.nowDate), offset)
  const b = monthBoundsFromKey(month) // start inclusive, next exclusive — [from, to)
  const { data, error } = await ctx.supabase.rpc('stock_intake_list', {
    p_from: b.start,
    p_to: b.next,
    p_limit: ctx.rowCap, // itemised list is capped…
  })
  if (error) return fail('ดึงรายการรับเข้าสต็อกไม่สำเร็จ')

  const rows = data ?? []
  // total_count = count(*) over () — the true set size computed BEFORE limit, so
  // `count`/`capped` stay correct even when the itemised list is truncated (§4.1).
  const totalCount = rows[0] ? rows[0].total_count : 0
  const items = rows.map((r) => ({
    name: r.name,
    qty: r.qty_total,
    cost_per_unit: r.cost_per_unit, // straight from the RPC — never recompute (§4-14)
  }))
  return ok({
    month,
    month_label: monthLabel(month), // human label the model shows; raw key stays too
    count: totalCount,
    items,
    capped: totalCount > items.length,
  })
}

async function staleStock(ctx: ToolContext): Promise<ToolOutcome> {
  const { data: items, error } = await ctx.supabase.from('stock_items').select('*').limit(RAW_ROW_MAX)
  if (error) return fail('ดึงข้อมูลสต็อกไม่สำเร็จ')
  const list = items ?? []
  if (list.length >= RAW_ROW_MAX) return ok({ too_many_items: true })

  // All age/sunk-cost logic comes from lib/stockAge (the age cap lives there —
  // never hardcode 60 again). daysSince/isStale/computeSunkCost share one age cap.
  // We deliberately DON'T surface that cap to the user: stockAge.ts admits it's an
  // "educated guess … not measured", so presenting "60 วัน" as a meaningful
  // threshold would be false precision. stale_count/sunk_cost are facts (how many
  // items, how much money) and stay; the model describes them as "ค้างนานผิดปกติ".
  const oldestInStockDays = list
    .filter(inStock)
    .reduce((max, it) => Math.max(max, daysSince(it.created_at, ctx.nowDate)), 0)
  return ok({
    oldest_in_stock_days: oldestInStockDays,
    stale_count: list.filter((it) => isStale(it, ctx.nowDate)).length,
    sunk_cost: computeSunkCost(list, ctx.nowDate),
  })
}
