/**
 * Read-only tools exposed to the model, plus their execution under the user's
 * RLS-scoped client. Everything here is READ-ONLY — nothing writes/updates/
 * deletes. The friends/debts group (design §6 kept it out of v1) is now touched
 * by exactly ONE tool, `debts_summary`, and ONLY at the headline level: three
 * aggregate numbers, no friend names / ids / per-item detail, no private notes.
 * See that function for why the narrow scope is safe.
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
import { computePace, computePaceStatic } from '../lib/budgetPace'
import { computeDebtsHeadline } from '../lib/debtsSummary'
import { addMonthsToKey, allTimeBounds, daysSince, monthAnchorFromKey, monthBounds, monthBoundsFromKey, monthKey } from '../lib/dates'
import { formatMonthLong } from '../lib/format'
import { computeHomeSummary } from '../lib/homeSummary'
import { isBudgetSpendingRow } from '../lib/ledger'
import { computeSunkCost, inStock, isStale } from '../lib/stockAge'
import { collectMonthOccurrences } from '../lib/upcomingBills'
import { resolveCategory } from './categories'

// ── tool definitions (sent verbatim as the Anthropic `tools` array) ──────────
const OFFSET_PROP = {
  type: 'integer',
  description: 'เดือนแบบ offset จำนวนเต็ม: 0=เดือนนี้ -1=เดือนที่แล้ว (ห้ามส่งวันที่)',
} as const

const PERIOD_PROP = {
  type: 'string',
  enum: ['month', 'all'],
  description: "ค่าเริ่มต้น month · 'all'=รวมทุกเดือน",
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
        period: PERIOD_PROP,
        offset: OFFSET_PROP,
        category: { type: 'string', description: 'ชื่อหมวดที่ผู้ใช้พูด เช่น "ค่าอาหาร" (จะให้ระบบหาหมวดให้)' },
        filter: { type: 'string', enum: ['all', 'income', 'expense', 'stock'], description: 'ค่าเริ่มต้น expense' },
      },
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
      properties: { period: PERIOD_PROP, offset: OFFSET_PROP },
      additionalProperties: false,
    },
  },
  {
    name: 'stock_intake',
    description: 'รายการที่ซื้อเข้าสต็อกในเดือน: ชื่อสินค้า/จำนวนที่รับเข้า/ราคาต่อหน่วย (สูงสุด 50)',
    input_schema: {
      type: 'object',
      properties: { period: PERIOD_PROP, offset: OFFSET_PROP },
      additionalProperties: false,
    },
  },
  {
    name: 'stale_stock',
    description: 'ของค้างในสต็อก: ค้างนานสุดกี่วัน จำนวนที่ค้างนาน และทุนจม ไม่รับพารามิเตอร์',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'budget_status',
    description: 'งบต่อหมวดของเดือน (เพดานที่ผู้ใช้ตั้งเอง): งบ/ใช้ไป/เหลือ/เกิน/สถานะ',
    input_schema: {
      type: 'object',
      properties: { offset: OFFSET_PROP },
      required: ['offset'],
      additionalProperties: false,
    },
  },
  {
    name: 'upcoming_bills',
    description: 'บิลประจำที่ยังรอจ่ายในเดือนนี้ (รายการ+ยอดรวม) ไม่รับพารามิเตอร์',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'debts_summary',
    description: 'ยอดค้างเพื่อนแบบยอดรวม: เพื่อนค้างเรารวม/เราค้างเพื่อนรวม/จำนวนเพื่อน ไม่รับพารามิเตอร์',
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

type Period = 'month' | 'all'

/** Time span for a month/all tool. Allowlist like readFilter: only 'all' opts
 *  into all-time; anything else (missing / unknown value) means 'month'. */
function readPeriod(input: unknown): Period {
  return asObject(input).period === 'all' ? 'all' : 'month'
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
    case 'budget_status':
      return budgetStatus(input, ctx)
    case 'upcoming_bills':
      return upcomingBills(ctx)
    case 'debts_summary':
      return debtsSummary(ctx)
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

/** Human phrase the model speaks for an all-time answer (period='all'). */
const ALL_TIME_LABEL = 'ทั้งหมดตั้งแต่เริ่มใช้'

/**
 * The span descriptor every month/all tool puts in its payload so the model can
 * always state which range the numbers cover (SYSTEM_PROMPT: "บอกที่มาเสมอ").
 * period='all' → month/month_label are null, never left as the current month —
 * otherwise the model reports the wrong span while the figure is right, and the
 * user can't catch it. `range_label` is the human phrase it says out loud.
 */
function rangeFields(
  period: Period,
  monthKeyResolved: string,
): { period: Period; month: string | null; month_label: string | null; range_label: string } {
  if (period === 'all') {
    return { period, month: null, month_label: null, range_label: ALL_TIME_LABEL }
  }
  const label = monthLabel(monthKeyResolved)
  return { period, month: monthKeyResolved, month_label: label, range_label: label }
}

/** One month's [from, to) in the same {from, to} shape as allTimeBounds, so the
 *  range tools pick a window by period without reshaping either result. */
function monthWindow(key: string): { from: string; to: string } {
  const b = monthBoundsFromKey(key) // start inclusive, next exclusive
  return { from: b.start, to: b.next }
}

async function monthSpending(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const period = readPeriod(input)
  const month = addMonthsToKey(monthKey(ctx.nowDate), readOffset(input))
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
    p_month: period === 'all' ? '' : month, // '' → every month (0024); else the one month
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
    ...rangeFields(period, month), // period + month/month_label (null when all) + range_label
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
  const period = readPeriod(input)
  const month = addMonthsToKey(monthKey(ctx.nowDate), readOffset(input))
  // [from, to): one month, or the whole history (all-time floor → tomorrow ICT).
  // The range comes from dates.ts — the worker never reckons the days itself.
  const { from, to } = period === 'all' ? allTimeBounds(ctx.nowDate) : monthWindow(month)
  const { data, error } = await ctx.supabase.rpc('stock_sales_summary', {
    p_from: from,
    p_to: to,
  })
  if (error) return fail('ดึงยอดขายไม่สำเร็จ')
  const s = (data ?? [])[0]
  return ok({
    ...rangeFields(period, month), // period + month/month_label (null when all) + range_label
    revenue: s ? s.revenue : 0,
    cogs: s ? s.cogs : 0,
    profit: s ? s.profit : 0, // ถัง1 − ถัง2 from the RPC — never spread per item
    qty_sold: s ? s.qty_sold : 0,
    sale_count: s ? s.sale_count : 0,
  })
}

async function stockIntake(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const period = readPeriod(input)
  const month = addMonthsToKey(monthKey(ctx.nowDate), readOffset(input))
  // [from, to): one month, or the whole history (all-time floor → tomorrow ICT).
  // The range comes from dates.ts — the worker never reckons the days itself.
  const { from, to } = period === 'all' ? allTimeBounds(ctx.nowDate) : monthWindow(month)
  const { data, error } = await ctx.supabase.rpc('stock_intake_list', {
    p_from: from,
    p_to: to,
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
    ...rangeFields(period, month), // period + month/month_label (null when all) + range_label
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

/**
 * Per-category budget status for a month — the ONLY tool that answers "งบเหลือ
 * เท่าไหร่". A budget is the ceiling the user set per category (`budgets` table),
 * NOT `budget_spending`/`safe_to_spend` from home_summary (those are spend / net,
 * not budgets — the regression this tool exists to kill). Everything here is
 * assembled from existing pieces; no money formula is re-derived (§4-14):
 *   - `budgets.month` is a DATE = the first of the month, not a 'YYYY-MM' key, so
 *     we match on monthBoundsFromKey(month).start.
 *   - per-category spend uses the shared isBudgetSpendingRow predicate (lib/ledger)
 *     on the raw rows — never a re-mirrored .eq() chain (that would be a third copy
 *     of the rule, convention 11) — so COGS / debt settlements / stock purchases /
 *     shop-operating costs are all left out of the budget spend.
 *   - the verdict (remaining / over / state) comes straight from computePace
 *     (lib/budgetPace), which deliberately does NOT clamp a negative remaining.
 */
async function budgetStatus(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const offset = readOffset(input)
  const month = addMonthsToKey(monthKey(ctx.nowDate), offset)
  const b = monthBoundsFromKey(month) // start = first-of-month DATE the budgets row keys on

  const { data: budgetRows, error: bErr } = await ctx.supabase
    .from('budgets')
    .select('category_id, amount')
    .eq('month', b.start)
  if (bErr) return fail('ดึงงบไม่สำเร็จ')

  const budgets = budgetRows ?? []
  // No budgets this month → say so explicitly. Answering "เหลือ ฿0" would read as
  // "งบหมดแล้ว" when the truth is the user never set one.
  if (budgets.length === 0) {
    return ok({ month, month_label: monthLabel(month), has_budgets: false })
  }

  const { data: cats, error: cErr } = await ctx.supabase.from('categories').select('id, name')
  if (cErr) return fail('ดึงหมวดไม่สำเร็จ')
  const nameById = new Map((cats ?? []).map((c) => [c.id, c.name]))

  const { data: txRows, error: tErr } = await ctx.supabase
    .from('transactions')
    .select('amount, type, category_id, is_stock_purchase, is_stock_cogs, is_debt_settlement, is_shop_operating')
    .gte('date', b.start)
    .lt('date', b.next)
    .limit(RAW_ROW_MAX)
  if (tErr) return fail('ดึงรายจ่ายไม่สำเร็จ')
  if ((txRows ?? []).length >= RAW_ROW_MAX) {
    // Would aggregate an incomplete set → refuse rather than under-report (§9).
    return ok({ month, month_label: monthLabel(month), too_many_transactions: true })
  }

  // Budget spend per category, via the ONE predicate (isBudgetSpendingRow).
  const usedById = new Map<string, number>()
  for (const r of txRows ?? []) {
    if (!isBudgetSpendingRow(r)) continue
    const id = r.category_id ?? ''
    usedById.set(id, (usedById.get(id) ?? 0) + (Number(r.amount) || 0))
  }

  // A closed (past) month has no days left to be ahead or behind of, so the
  // elapsed-fraction 'fast' verdict is meaningless there — computePace with
  // today's date would grade a finished month against THIS month's progress and
  // brand nearly every past category 'fast'. Only the CURRENT month gets the
  // date-aware computePace; every other month uses computePaceStatic (no 'fast').
  // Decide on the resolved 'YYYY-MM' key vs monthKey(now) as plain strings —
  // never re-parse to Date (convention 11: a "month" is the string, not a Date).
  // We phrase this as "not the current month → static", NOT "offset < 0 →
  // static", so it never leans on readOffset's <= 0 clamp (which could change).
  // BudgetPage.tsx:354 makes the SAME split (editable ? computePace :
  // computePaceStatic) — keep them parallel; do not "simplify" this back into a
  // single computePace call.
  const isCurrentMonth = month === monthKey(ctx.nowDate)
  let totalBudget = 0
  let totalUsed = 0
  const categories = budgets.map((row) => {
    const budget = Number(row.amount) || 0
    const used = usedById.get(row.category_id) ?? 0
    const pace = isCurrentMonth
      ? computePace(used, budget, ctx.nowDate) // remaining/over NOT clamped (§4-13)
      : computePaceStatic(used, budget) // past month: same figures, no 'fast'
    totalBudget += budget
    totalUsed += used
    return {
      name: nameById.get(row.category_id) ?? null,
      budget,
      used,
      remaining: pace.remaining, // budget − used, negative when over (never clamped)
      over: pace.over, // used − budget when over, else 0
      status: pace.state, // over / fast / unused / on_track from Pace
    }
  })

  return ok({
    month,
    month_label: monthLabel(month), // human label the model shows; raw key stays too
    has_budgets: true,
    categories,
    total_budget: totalBudget,
    total_used: totalUsed, // spend that counts in the BUDGETED categories, not the whole month
    total_remaining: totalBudget - totalUsed, // negative when over overall (never clamped)
  })
}

/**
 * Cap on active expense rules read for the "รอจ่าย" answer. On the home screen
 * useUpcomingBills runs under React Query and can wait as long as it likes; here
 * the same work runs under the shared AI_REQUEST_DEADLINE_MS (45s spanning EVERY
 * round of the tool loop), so an unbounded rule count could starve the rest of a
 * mixed question and 504. See upcomingBills() for why the enumeration is an N+M
 * round-trip. Set far above a real person's handful of recurring bills; reaching
 * it means something is off, so we surface too_many_rules rather than aggregate
 * an incomplete set (§9 — Supabase returns rows already limited, and a silent
 * under-report of pending money is exactly the trap we must not fall into).
 */
const MAX_RECURRING_RULES = 100

/**
 * Recurring EXPENSE bills still due THIS month — the "รอจ่าย" strip already on
 * the home screen, made answerable. A worker-side mirror of the useUpcomingBills
 * hook (same collectMonthOccurrences + recurring_next_date), minus React and
 * minus the icon/color_index fields (those draw the screen; the model reasons
 * over date/label/amount only).
 *
 * "Now" ONLY — no offset/period, unlike the month tools. useUpcomingBills is
 * deliberately month-less (§11.4-21): last month's unpaid bills don't exist
 * (recurring_run_due already materialized them into `expense`), and next month's
 * aren't "pending" yet. An offset here would let the model ask for a month whose
 * number can't be interpreted, so the schema takes no parameters — same shape as
 * wallet_balances / stale_stock.
 *
 * COST — this is an N+M round-trip, NOT one query, and that is deliberate. One
 * read of `recurring`, then collectMonthOccurrences walks each rule's schedule by
 * calling the recurring_next_date RPC once PER STEP (one HTTP round-trip to
 * PostgREST each): a monthly rule costs ~1–2 steps, a daily one up to
 * MAX_OCCURRENCES_PER_RULE (40). We accept it because the schedule arithmetic is
 * the DB's — the worker must never re-derive a date (§4-14) — and the scale is
 * tiny (a few users, a few rules). MAX_RECURRING_RULES bounds the rule count so a
 * burst can't exhaust the request budget; recurring_next_date is confirmed
 * callable from the worker under the user's JWT (migration 0008: grant execute to
 * authenticated, immutable, security invoker).
 */
async function upcomingBills(ctx: ToolContext): Promise<ToolOutcome> {
  const { data, error } = await ctx.supabase
    .from('recurring')
    .select('id, label, amount, schedule, next_run')
    .eq('active', true)
    .eq('type', 'expense') // RLS already scopes rows to the caller; active expense rules only
    .limit(MAX_RECURRING_RULES)
  if (error) return fail('ดึงรายการรอจ่ายไม่สำเร็จ')

  const rules = data ?? []
  // Hit the read cap → we can't be sure we have every rule, so refuse rather
  // than under-report the pending total (§9). Distinct from has_rules:false.
  if (rules.length >= MAX_RECURRING_RULES) {
    return ok({ too_many_rules: true })
  }

  const bounds = monthBounds(ctx.nowDate) // this-month [start, next); "now" only, never an offset
  try {
    const items: Array<{ date: string; label: string; amount: number }> = []
    for (const r of rules) {
      if (!r.next_run) continue
      // Schedule arithmetic stays in the DB (recurring_next_date) — the worker
      // never parses a schedule string (§4-14). One round-trip per step.
      const dates = await collectMonthOccurrences(r.next_run, bounds, async (from) => {
        const { data: nd, error: ndErr } = await ctx.supabase.rpc('recurring_next_date', {
          p_from: from,
          p_schedule: r.schedule,
        })
        if (ndErr) throw ndErr
        return nd
      })
      for (const d of dates) {
        items.push({ date: d, label: r.label, amount: Number(r.amount) || 0 })
      }
    }
    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const total = items.reduce((s, x) => s + x.amount, 0)
    // has_rules:false = no active expense rule at all (never set one up) — NOT the
    // same as "set up but everything's already been charged this month"
    // (has_rules:true + empty items). The model must tell these apart, so it never
    // says "ไม่มีบิล" when the truth is "ยังไม่ได้ตั้งรายการประจำ".
    return ok({ items, total, has_rules: rules.length > 0 })
  } catch {
    // collectMonthOccurrences throws on the per-rule occurrence cap, and the
    // nextDate callback throws on an RPC error — report rather than crash the
    // turn (a null next date is handled inside the lib and does NOT throw).
    return fail('คำนวณรายการรอจ่ายไม่สำเร็จ')
  }
}

/**
 * Friend outstanding balances — HEADLINE ONLY (design §6 kept the whole
 * friends/debts group out of v1; this reopens it at the narrowest slice after the
 * read-only pattern proved out). The scope here is deliberately the smallest that
 * answers "มียอดค้างเพื่อนมั้ย" and nothing wider:
 *  - `friend_debts_summary()` is 0-arg + INVOKER, so RLS scopes it to the caller —
 *    the model never names whose data to read (same identity rule as every tool).
 *  - computeDebtsHeadline (lib/debtsSummary) is the ONE place these totals are
 *    summed (convention 11); we never add amounts here. It reads only `shared_net`,
 *    so PRIVATE ("จดไว้เอง") balances are excluded by construction — they can't
 *    reach the payload even by accident.
 *  - Two GROSS figures, never one blended net: across friends they don't cancel
 *    (one friend owing me doesn't pay what I owe another), so a single number would
 *    answer nothing — see the comment in debtsSummary.ts.
 *  - We return ONLY the three headline numbers + a has_friends flag. `display_name`
 *    / `friend_id` and every `private_*` column are NEVER put in the payload:
 *    display_name is free text the OTHER party set (a cross-user prompt-injection
 *    surface, §6), and private notes must not leak. Per-friend / per-item detail
 *    lives in the app's ยอดค้าง tab, not here.
 */
async function debtsSummary(ctx: ToolContext): Promise<ToolOutcome> {
  const { data, error } = await ctx.supabase.rpc('friend_debts_summary')
  if (error) return fail('ดึงยอดค้างไม่สำเร็จ')
  const h = computeDebtsHeadline(data ?? [])
  return ok({
    they_owe_me: h.theyOweMe, // Σ of each friend's positive net (shared only)
    i_owe_them: h.iOweThem, // Σ of each friend's |negative net| (shared only)
    friend_count: h.friendCount, // accepted friends, cleared or not
    has_friends: h.friendCount > 0, // false → "ยังไม่มีเพื่อน", not "ยอดค้าง ฿0"
  })
}
