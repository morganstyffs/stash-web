import { describe, it, expect, beforeEach, vi } from 'vitest'

// resolveCategory is nearly pure — its only dependency is a Supabase read of the
// `categories` table. We stub @supabase/supabase-js with the MINIMAL query shape
// resolveCategory actually uses (`.from(t).select(...).eq(...)` awaited), the same
// "smallest real shape, no cast" approach as tools.test.ts: createClient<Database>
// keeps the real type signature while the runtime object is the stub.
interface MockResult {
  data: unknown
  error: unknown
}

const state = vi.hoisted(() => ({
  tables: {} as Record<string, MockResult>,
}))

vi.mock('@supabase/supabase-js', () => {
  interface Q {
    select: () => Q
    eq: () => Q
    then: (onF: (v: MockResult) => unknown) => Promise<unknown>
  }
  const build = (table: string): Q => {
    const result = (): MockResult => state.tables[table] ?? { data: [], error: null }
    const q: Q = {
      select: () => q,
      eq: () => q,
      then: (onF) => Promise.resolve(result()).then(onF),
    }
    return q
  }
  return {
    createClient: () => ({ from: (table: string) => build(table) }),
  }
})

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { resolveCategory } from './categories'

const supabase = () => createClient<Database>('https://x.supabase.co', 'anon')

beforeEach(() => {
  state.tables = {}
})

// The real seed: the category is the SHORT word "อาหาร"; users say the longer
// "ค่าอาหาร". Plus a look-alike ("อาหารสัตว์") the exact input must not drag in,
// a batch of "ค่า…" categories for the ambiguity case, and a system category.
function seedCategories() {
  state.tables.categories = {
    data: [
      { id: 'c-food', name: 'อาหาร', is_system: false, system_key: null },
      { id: 'c-pet', name: 'อาหารสัตว์', is_system: false, system_key: null },
      { id: 'c-ship', name: 'ค่าส่ง', is_system: false, system_key: null },
      { id: 'c-fee', name: 'ค่าธรรมเนียมขาย', is_system: false, system_key: null },
      { id: 'c-house', name: 'บิลค่าบ้าน', is_system: false, system_key: null },
      { id: 'c-sys', name: 'ต้นทุนขาย', is_system: true, system_key: 'stock_cogs' },
    ],
    error: null,
  }
}

describe('resolveCategory — two tiers: exact wins, else match both directions', () => {
  it('exact match wins outright, even when an overlapping category exists', async () => {
    seedCategories()
    // "อาหาร" is a substring of "อาหารสัตว์"; exact tier must return c-food
    // WITHOUT ever reaching the ambiguous branch.
    const r = await resolveCategory(supabase(), 'อาหาร')
    expect(r).toEqual({ status: 'matched', id: 'c-food', name: 'อาหาร' })
  })

  it('longer typed word finds the shorter category (target.includes(name))', async () => {
    seedCategories()
    // "ค่าอาหาร" ⊇ "อาหาร" — the reverse direction a one-way include never caught.
    const r = await resolveCategory(supabase(), 'ค่าอาหาร')
    expect(r).toEqual({ status: 'matched', id: 'c-food', name: 'อาหาร' })
  })

  it('a word overlapping several categories → ambiguous with all their names', async () => {
    seedCategories()
    // "ค่า" is a substring of ค่าส่ง / ค่าธรรมเนียมขาย / บิลค่าบ้าน.
    const r = await resolveCategory(supabase(), 'ค่า')
    expect(r.status).toBe('ambiguous')
    if (r.status === 'ambiguous')
      expect(r.names.sort()).toEqual(['ค่าธรรมเนียมขาย', 'ค่าส่ง', 'บิลค่าบ้าน'].sort())
  })

  it('no overlap either direction → none', async () => {
    seedCategories()
    expect((await resolveCategory(supabase(), 'ไม่มีหมวดนี้')).status).toBe('none')
  })

  it('a SYSTEM category is never matched by its Thai name, exact or otherwise (rule 6)', async () => {
    seedCategories()
    // "ต้นทุนขาย" is the exact name of the system category — must still be none.
    expect((await resolveCategory(supabase(), 'ต้นทุนขาย')).status).toBe('none')
  })

  it('normalizes whitespace and case before comparing (exact still wins)', async () => {
    state.tables.categories = {
      data: [{ id: 'c-web', name: 'Web Hosting', is_system: false, system_key: null }],
      error: null,
    }
    const r = await resolveCategory(supabase(), '  web hosting ')
    expect(r).toEqual({ status: 'matched', id: 'c-web', name: 'Web Hosting' })
  })

  it('blank input (only whitespace) → none, without a query result mattering', async () => {
    seedCategories()
    expect((await resolveCategory(supabase(), '   ')).status).toBe('none')
  })
})
