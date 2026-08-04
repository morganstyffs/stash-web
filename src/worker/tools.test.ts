import { describe, it, expect, beforeEach, vi } from 'vitest'

// Detailed tests for the read-only tools + category resolution. No network:
// @supabase/supabase-js is mocked with a flexible query builder that also
// records the rpc name + args, so we can assert offset→YYYY-MM conversion.
interface MockResult {
  data: unknown
  error: unknown
}

const state = vi.hoisted(() => ({
  tables: {} as Record<string, MockResult>,
  rpcResults: {} as Record<string, MockResult>,
  rpcArgs: {} as Record<string, unknown>,
  rpcCalls: [] as string[],
}))

vi.mock('@supabase/supabase-js', () => {
  interface Q {
    select: () => Q
    eq: () => Q
    gte: () => Q
    lt: () => Q
    limit: () => Q
    maybeSingle: () => Promise<MockResult>
    then: (onF: (v: MockResult) => unknown) => Promise<unknown>
  }
  const build = (table: string): Q => {
    const result = (): MockResult => state.tables[table] ?? { data: [], error: null }
    const q: Q = {
      select: () => q,
      eq: () => q,
      gte: () => q,
      lt: () => q,
      limit: () => q,
      maybeSingle: async () => result(),
      then: (onF) => Promise.resolve(result()).then(onF),
    }
    return q
  }
  return {
    createClient: () => ({
      from: (table: string) => build(table),
      rpc: async (fn: string, args?: unknown) => {
        state.rpcCalls.push(fn)
        state.rpcArgs[fn] = args
        return state.rpcResults[fn] ?? { data: [], error: null }
      },
    }),
  }
})

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { runTool, AI_TOOLS, type ToolContext } from './tools'
import { resolveCategory } from './categories'
import { allTimeBounds } from '../lib/dates'

// A Jan-15 instant → Bangkok month 2026-01, so offset -1 crosses the year.
const NOW = new Date('2026-01-15T05:00:00Z')

function ctx(): ToolContext {
  return { supabase: createClient<Database>('https://x.supabase.co', 'anon'), nowDate: NOW, rowCap: 50 }
}

async function parse(name: string, input: unknown): Promise<Record<string, unknown>> {
  const outcome = await runTool(name, input, ctx())
  return JSON.parse(outcome.content) as Record<string, unknown>
}

beforeEach(() => {
  state.tables = {}
  state.rpcResults = {}
  state.rpcArgs = {}
  state.rpcCalls = []
})

// A user's own category set with a look-alike pair and a system category.
function seedCategories() {
  state.tables.categories = {
    data: [
      { id: 'c-food', name: 'ค่าอาหาร', is_system: false, system_key: null },
      { id: 'c-pet', name: 'อาหารสัตว์', is_system: false, system_key: null },
      { id: 'c-sys', name: 'ต้นทุนขาย', is_system: true, system_key: 'stock_cogs' },
    ],
    error: null,
  }
}

describe('resolveCategory (design §7.1) — ambiguous asks back, never guesses', () => {
  it('one substring match → matched', async () => {
    seedCategories()
    const r = await resolveCategory(ctx().supabase, 'ค่าอาหาร')
    expect(r).toEqual({ status: 'matched', id: 'c-food', name: 'ค่าอาหาร' })
  })

  it('more than one match → ambiguous (both names, no guess)', async () => {
    seedCategories()
    const r = await resolveCategory(ctx().supabase, 'อาหาร') // matches ค่าอาหาร AND อาหารสัตว์
    expect(r.status).toBe('ambiguous')
    if (r.status === 'ambiguous') expect(r.names.sort()).toEqual(['ค่าอาหาร', 'อาหารสัตว์'])
  })

  it('no match → none', async () => {
    seedCategories()
    expect((await resolveCategory(ctx().supabase, 'ไม่มีหมวดนี้')).status).toBe('none')
  })

  it('a SYSTEM category is never matched by its Thai name (rule 6)', async () => {
    seedCategories()
    expect((await resolveCategory(ctx().supabase, 'ต้นทุนขาย')).status).toBe('none')
  })
})

describe('month_spending — offset→YYYY-MM (worker computes, model never sends a date)', () => {
  it('offset 0 → this month', async () => {
    await parse('month_spending', { offset: 0 })
    expect((state.rpcArgs.transactions_search as { p_month: string }).p_month).toBe('2026-01')
  })

  it('offset -1 → previous month, crossing the year', async () => {
    await parse('month_spending', { offset: -1 })
    expect((state.rpcArgs.transactions_search as { p_month: string }).p_month).toBe('2025-12')
  })

  it('a non-integer / string offset falls back to this month (no date string reaches SQL)', async () => {
    await parse('month_spending', { offset: '2025-06-01' })
    expect((state.rpcArgs.transactions_search as { p_month: string }).p_month).toBe('2026-01')
  })
})

describe('month_spending — category resolution feeds the answer, ambiguity stops it', () => {
  it('ambiguous category → needs_clarification, and NO search is run', async () => {
    seedCategories()
    const out = await parse('month_spending', { offset: 0, category: 'อาหาร' })
    expect(out.needs_clarification).toBe(true)
    expect(state.rpcCalls).not.toContain('transactions_search')
  })

  it('unknown category → category_not_found, and NO search is run', async () => {
    seedCategories()
    const out = await parse('month_spending', { offset: 0, category: 'ไม่มีหมวดนี้' })
    expect(out.category_not_found).toBe(true)
    expect(state.rpcCalls).not.toContain('transactions_search')
  })

  it('resolved category → search runs with that category id', async () => {
    seedCategories()
    await parse('month_spending', { offset: 0, category: 'ค่าอาหาร' })
    expect((state.rpcArgs.transactions_search as { p_category_id: string }).p_category_id).toBe('c-food')
  })
})

describe('month_spending — row cap (design §4.1): total from aggregate, not row-sum', () => {
  it('caps items at rowCap, flags capped, and totals come from match_* (correct even when capped)', async () => {
    // 50 rows returned (= rowCap), but the true count is 120 and the true expense
    // total is 9999 — a row-sum of the 50 items (50×10=500) would be WRONG.
    const rows = Array.from({ length: 50 }, () => ({
      date: '2026-01-05',
      amount: 10,
      category_name: 'ค่าอาหาร',
      note: '',
      type: 'expense',
      match_count: 120,
      match_income: 0,
      match_expense: 9999,
    }))
    state.rpcResults.transactions_search = { data: rows, error: null }
    const out = await parse('month_spending', { offset: 0 })
    expect((out.items as unknown[]).length).toBe(50)
    expect(out.count).toBe(120)
    expect(out.capped).toBe(true)
    expect(out.total_expense).toBe(9999) // from aggregate, NOT 50×10
  })
})

describe('stock_intake — offset→[p_from,p_to) via monthBoundsFromKey (worker computes the range)', () => {
  it('offset 0 → this-month bounds, limit = rowCap', async () => {
    await parse('stock_intake', { offset: 0 })
    const args = state.rpcArgs.stock_intake_list as { p_from: string; p_to: string; p_limit: number }
    expect(args.p_from).toBe('2026-01-01')
    expect(args.p_to).toBe('2026-02-01') // half-open: next month, exclusive
    expect(args.p_limit).toBe(50)
  })

  it('offset -1 → previous month, crossing the year', async () => {
    await parse('stock_intake', { offset: -1 })
    const args = state.rpcArgs.stock_intake_list as { p_from: string; p_to: string }
    expect(args.p_from).toBe('2025-12-01')
    expect(args.p_to).toBe('2026-01-01')
  })
})

describe('stock_intake — row cap (§4.1): count from total_count window, not row length', () => {
  it('caps items at rowCap, flags capped, count = RPC total_count', async () => {
    // 50 rows returned (= rowCap) but the true set is 137. A row-count would say
    // 50 — wrong. total_count (count(*) over ()) is right even when capped.
    const rows = Array.from({ length: 50 }, (_, i) => ({
      name: `ของ ${i}`,
      qty_total: 2,
      cost_per_unit: 100,
      total_count: 137,
    }))
    state.rpcResults.stock_intake_list = { data: rows, error: null }
    const out = await parse('stock_intake', { offset: -1 })
    expect((out.items as unknown[]).length).toBe(50)
    expect(out.count).toBe(137)
    expect(out.capped).toBe(true)
    // items carry the RPC's raw fields (never recomputed)
    expect((out.items as Array<Record<string, unknown>>)[0]).toEqual({
      name: 'ของ 0',
      qty: 2,
      cost_per_unit: 100,
    })
  })

  it('empty month → count 0, no items, not capped', async () => {
    state.rpcResults.stock_intake_list = { data: [], error: null }
    const out = await parse('stock_intake', { offset: 0 })
    expect(out.count).toBe(0)
    expect((out.items as unknown[]).length).toBe(0)
    expect(out.capped).toBe(false)
  })
})

describe('wallet_balances — real wallet names, not "wallet 2"', () => {
  it('joins names from the wallets table', async () => {
    state.rpcResults.wallet_balances = { data: [{ wallet_id: 'w1', balance: 250 }], error: null }
    state.tables.wallets = { data: [{ id: 'w1', name: 'ธนาคาร' }], error: null }
    const out = await parse('wallet_balances', undefined)
    expect(out.wallets).toEqual([{ name: 'ธนาคาร', balance: 250 }])
  })
})

describe('stale_stock — the guessed age cap is NOT surfaced to the user', () => {
  it('drops stale_threshold_days (an admitted guess) but keeps the facts', async () => {
    state.tables.stock_items = { data: [], error: null }
    const out = await parse('stale_stock', undefined)
    // the cap (AGE_OLD_MAX) is presentation-false-precision → must not leak
    expect(out).not.toHaveProperty('stale_threshold_days')
    // facts stay: how many items, how much money, and the oldest age
    expect(out).toHaveProperty('stale_count')
    expect(out).toHaveProperty('sunk_cost')
    expect(out).toHaveProperty('oldest_in_stock_days')
  })
})

describe('month tools — carry a human month label AND keep the raw key', () => {
  it('month_spending returns month_label (Buddhist-era Thai) alongside the raw month key', async () => {
    const out = await parse('month_spending', { offset: 0 }) // NOW = 2026-01
    expect(out.month).toBe('2026-01') // raw key kept — model may compare months
    expect(out.month_label).toBe('มกราคม 2569') // human label the model shows the user
  })

  it('the label follows the resolved month (offset -1 crosses the year)', async () => {
    const out = await parse('stock_intake', { offset: -1 }) // → 2025-12
    expect(out.month).toBe('2025-12')
    expect(out.month_label).toBe('ธันวาคม 2568')
  })

  it('home_summary and stock_sales carry month_label too', async () => {
    const home = await parse('home_summary', { offset: 0 })
    expect(home.month_label).toBe('มกราคม 2569')
    const sales = await parse('stock_sales', { offset: 0 })
    expect(sales.month_label).toBe('มกราคม 2569')
  })
})

describe('budget_status — the ceiling the user set per category, NOT budget_spending/safe_to_spend', () => {
  // A month with two budgets: อาหาร ฿4,000 and เดินทาง ฿2,000.
  function seedBudgets() {
    state.tables.categories = {
      data: [
        { id: 'c-food', name: 'อาหาร' },
        { id: 'c-trav', name: 'เดินทาง' },
      ],
      error: null,
    }
    state.tables.budgets = {
      data: [
        { category_id: 'c-food', amount: 4000 },
        { category_id: 'c-trav', amount: 2000 },
      ],
      error: null,
    }
  }

  // Plain expense row with every ledger flag off; override per case.
  function tx(over: Record<string, unknown>) {
    return {
      amount: 0,
      type: 'expense',
      category_id: null,
      is_stock_purchase: false,
      is_stock_cogs: false,
      is_debt_settlement: false,
      is_shop_operating: false,
      ...over,
    }
  }

  it('over-budget category keeps a NEGATIVE remaining (never clamped); a funded one still has room', async () => {
    seedBudgets()
    state.tables.transactions = {
      data: [
        tx({ amount: 5000, category_id: 'c-food' }), // 5000 > 4000 → over
        tx({ amount: 500, category_id: 'c-trav' }), // 500 < 2000 → room left
      ],
      error: null,
    }
    const out = await parse('budget_status', { offset: 0 })
    expect(out.has_budgets).toBe(true)
    const cats = out.categories as Array<Record<string, unknown>>
    const food = cats.find((c) => c.name === 'อาหาร')!
    expect(food.used).toBe(5000)
    expect(food.remaining).toBe(-1000) // budget − used, NOT clamped to 0
    expect(food.over).toBe(1000)
    expect(food.status).toBe('over')
    const trav = cats.find((c) => c.name === 'เดินทาง')!
    expect(trav.used).toBe(500)
    expect(trav.remaining).toBe(1500)
    expect(trav.over).toBe(0)
    expect(trav.status).not.toBe('over')
    // totals span the budgeted categories only
    expect(out.total_budget).toBe(6000)
    expect(out.total_used).toBe(5500)
    expect(out.total_remaining).toBe(500)
  })

  it('a month with no budgets set → has_budgets:false (never answer "เหลือ ฿0")', async () => {
    state.tables.budgets = { data: [], error: null }
    const out = await parse('budget_status', { offset: 0 })
    expect(out.has_budgets).toBe(false)
    expect(out).not.toHaveProperty('categories')
  })

  it('carries a Buddhist-era Thai month_label alongside the raw key', async () => {
    seedBudgets()
    const out = await parse('budget_status', { offset: 0 }) // NOW = 2026-01
    expect(out.month).toBe('2026-01')
    expect(out.month_label).toBe('มกราคม 2569')
  })

  it('COGS / debt settlement / stock purchase / shop-operating are NOT counted (proves isBudgetSpendingRow)', async () => {
    seedBudgets()
    state.tables.transactions = {
      data: [
        tx({ amount: 1000, category_id: 'c-food' }), // the ONLY real budget spend
        tx({ amount: 9999, category_id: 'c-food', is_stock_cogs: true }), // ต้นทุนขาย
        tx({ amount: 9999, category_id: 'c-food', is_debt_settlement: true }), // เคลียร์ยอดค้าง
        tx({ amount: 9999, category_id: 'c-food', is_stock_purchase: true }), // ซื้อเข้าสต็อก
        tx({ amount: 9999, category_id: 'c-food', is_shop_operating: true }), // ค่าดำเนินร้าน
      ],
      error: null,
    }
    const out = await parse('budget_status', { offset: 0 })
    const food = (out.categories as Array<Record<string, unknown>>).find((c) => c.name === 'อาหาร')!
    expect(food.used).toBe(1000) // the four excluded rows never touched the total
    expect(food.remaining).toBe(3000)
    expect(food.status).toBe('on_track')
  })

  // The pace LABEL must switch by month. The CURRENT month is graded against how
  // far into it we are (computePace → can be 'fast'); a CLOSED month has no days
  // left to outrun, so it uses computePaceStatic (never 'fast'). Same split as
  // BudgetPage.tsx:354. The two cases below share the EXACT same figures and
  // differ ONLY in offset — if budgetStatus ever collapses back to a single
  // computePace, the past-month case flips to 'fast' and this pair fails.
  it('current month: spend outrunning the elapsed days → "fast" (proves computePace is still used)', async () => {
    seedBudgets()
    state.tables.transactions = {
      // NOW = 2026-01-15 → 15/31 of Jan elapsed (~0.48); 3000/4000 = 0.75 outruns it.
      data: [tx({ amount: 3000, category_id: 'c-food' })],
      error: null,
    }
    const out = await parse('budget_status', { offset: 0 })
    const food = (out.categories as Array<Record<string, unknown>>).find((c) => c.name === 'อาหาร')!
    expect(food.status).toBe('fast')
    expect(food.budget).toBe(4000)
    expect(food.used).toBe(3000)
    expect(food.remaining).toBe(1000)
    expect(food.over).toBe(0)
  })

  it('past month: the SAME numbers are NOT "fast" (closed month → computePaceStatic) — the regression this fix targets', async () => {
    seedBudgets()
    state.tables.transactions = {
      // Identical spend to the offset-0 case above; only the month differs.
      data: [tx({ amount: 3000, category_id: 'c-food' })],
      error: null,
    }
    const out = await parse('budget_status', { offset: -1 }) // 2025-12, a closed month
    const food = (out.categories as Array<Record<string, unknown>>).find((c) => c.name === 'อาหาร')!
    expect(food.status).not.toBe('fast') // was wrongly 'fast' before the fix
    expect(food.status).toBe('on_track')
    // Every figure matches the current-month case — ONLY the status label differs.
    expect(food.budget).toBe(4000)
    expect(food.used).toBe(3000)
    expect(food.remaining).toBe(1000)
    expect(food.over).toBe(0)
  })
})

describe('tool schemas — offset is an integer, never a date string', () => {
  it('month-based tools declare offset as integer and take no date field', () => {
    for (const name of ['month_spending', 'home_summary', 'stock_sales', 'stock_intake', 'budget_status']) {
      const tool = AI_TOOLS.find((t) => t.name === name)
      expect(tool).toBeTruthy()
      const props = tool!.input_schema.properties as Record<string, { type?: string }>
      expect(props.offset?.type).toBe('integer')
      for (const key of Object.keys(props)) expect(key).not.toMatch(/date|month|from|to/i)
    }
  })
})

describe('period="all" — every-month / all-time span, not just one month', () => {
  it('month_spending period=all → p_month "" (0024: empty = every month)', async () => {
    await parse('month_spending', { period: 'all' })
    expect((state.rpcArgs.transactions_search as { p_month: string }).p_month).toBe('')
  })

  it('stock_sales period=all → p_from/p_to straight from allTimeBounds (floor → tomorrow ICT)', async () => {
    await parse('stock_sales', { period: 'all' })
    // exactly the helper's window — the worker never reckons the all-time days itself
    const { from, to } = allTimeBounds(NOW)
    expect(state.rpcArgs.stock_sales_summary).toEqual({ p_from: from, p_to: to })
  })

  it('stock_intake period=all → p_from/p_to from allTimeBounds, limit = rowCap', async () => {
    await parse('stock_intake', { period: 'all' })
    const args = state.rpcArgs.stock_intake_list as { p_from: string; p_to: string; p_limit: number }
    const { from, to } = allTimeBounds(NOW)
    expect(args.p_from).toBe(from)
    expect(args.p_to).toBe(to)
    expect(args.p_limit).toBe(50)
  })

  it('period=all → month and month_label are null (never the current month), with a human range_label', async () => {
    for (const name of ['month_spending', 'stock_sales', 'stock_intake']) {
      const out = await parse(name, { period: 'all' })
      expect(out.month).toBeNull()
      expect(out.month_label).toBeNull()
      expect(out.period).toBe('all')
      expect(out.range_label).toBe('ทั้งหมดตั้งแต่เริ่มใช้')
    }
  })

  it('an unknown period value falls back to "month" (allowlist, like filter)', async () => {
    await parse('month_spending', { period: 'year' })
    expect((state.rpcArgs.transactions_search as { p_month: string }).p_month).toBe('2026-01')
    const out = await parse('stock_intake', { period: 'ทั้งปี', offset: 0 })
    const args = state.rpcArgs.stock_intake_list as { p_from: string; p_to: string }
    expect(args.p_from).toBe('2026-01-01')
    expect(args.p_to).toBe('2026-02-01')
    expect(out.month).toBe('2026-01')
    expect(out.period).toBe('month')
  })

  it('omitting period keeps the exact month behaviour — offset still applies', async () => {
    await parse('stock_sales', { offset: -1 })
    const args = state.rpcArgs.stock_sales_summary as { p_from: string; p_to: string }
    expect(args.p_from).toBe('2025-12-01')
    expect(args.p_to).toBe('2026-01-01')
    const out = await parse('month_spending', { offset: 0 })
    expect(out.month).toBe('2026-01')
    expect(out.period).toBe('month')
  })

  it('period=all ignores any offset sent alongside it (all-time, not a month)', async () => {
    await parse('stock_sales', { period: 'all', offset: -3 })
    const { from, to } = allTimeBounds(NOW)
    expect(state.rpcArgs.stock_sales_summary).toEqual({ p_from: from, p_to: to })
  })
})
