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
import { AGE_OLD_MAX } from '../lib/stockAge'

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

describe('stock tools — thresholds come from lib, not hardcoded', () => {
  it('stale_stock reports the AGE_OLD_MAX threshold from lib/stockAge', async () => {
    state.tables.stock_items = { data: [], error: null }
    const out = await parse('stale_stock', undefined)
    expect(out.stale_threshold_days).toBe(AGE_OLD_MAX)
  })
})

describe('tool schemas — offset is an integer, never a date string', () => {
  it('month-based tools declare offset as integer and take no date field', () => {
    for (const name of ['month_spending', 'home_summary', 'stock_sales', 'stock_intake']) {
      const tool = AI_TOOLS.find((t) => t.name === name)
      expect(tool).toBeTruthy()
      const props = tool!.input_schema.properties as Record<string, { type?: string }>
      expect(props.offset?.type).toBe('integer')
      for (const key of Object.keys(props)) expect(key).not.toMatch(/date|month|from|to/i)
    }
  })
})
