import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Worker tests for /api/ai. NOTHING here hits the network: @supabase/supabase-js
// is mocked, KV is a stub, and global fetch (the Anthropic call) is a vi.fn().
// The load-bearing assertions are that a rejected request (bad token / no
// consent / rate-limited) NEVER reaches Anthropic — that's the money guard.
//
// State lives in vi.hoisted so the hoisted vi.mock factory can see it.
const state = vi.hoisted(() => ({
  getUser: { data: { user: null as { id: string } | null }, error: null as { status?: number } | null },
  consent: { data: null as { consent?: boolean } | null, error: null as unknown },
  rpc: { data: null as unknown, error: null as unknown },
  createClientCalls: 0,
  authHeader: undefined as string | undefined,
  eqColumn: undefined as string | undefined,
  eqValue: undefined as string | undefined,
  rpcCalls: [] as string[],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (
    _url: string,
    _key: string,
    opts: { global?: { headers?: Record<string, string> } },
  ) => {
    state.createClientCalls++
    state.authHeader = opts?.global?.headers?.Authorization
    return {
      auth: { getUser: async () => state.getUser },
      from: () => ({
        select: () => ({
          eq: (column: string, value: string) => {
            state.eqColumn = column
            state.eqValue = value
            return { maybeSingle: async () => state.consent }
          },
        }),
      }),
      rpc: async (fn: string) => {
        state.rpcCalls.push(fn)
        return state.rpc
      },
    }
  },
}))

import { handleAi } from './ai'
import type { Env } from './index'
import { AI_TOOLS } from './tools'
import { RL_PER_MINUTE, RL_PER_DAY, type RateLimitStore } from './rateLimit'

const SESSION_EXPIRED = 'เซสชันหมดอายุ เข้าสู่ระบบใหม่'
const NO_CONSENT = 'ยังไม่ได้เปิดใช้ผู้ช่วย AI — เปิดได้ในหน้าตั้งค่า'

// ── Anthropic fetch mock ─────────────────────────────────────────────────────
// A queue of scripted responses; each fetch() shifts the next one. Records how
// many times Anthropic was called so tests can assert "never reached".
const fetchState = vi.hoisted(() => ({
  calls: 0,
  queue: [] as Array<{ status?: number; body?: unknown; throwName?: string }>,
}))

function anthropicText(text: string) {
  return { status: 200, body: { stop_reason: 'end_turn', content: [{ type: 'text', text }] } }
}
function anthropicToolUse(id: string, name: string) {
  return {
    status: 200,
    body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input: {} }] },
  }
}

beforeEach(() => {
  state.getUser = { data: { user: null }, error: null }
  state.consent = { data: null, error: null }
  state.rpc = { data: [], error: null }
  state.createClientCalls = 0
  state.authHeader = undefined
  state.eqColumn = undefined
  state.eqValue = undefined
  state.rpcCalls = []
  fetchState.calls = 0
  fetchState.queue = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      fetchState.calls++
      const next = fetchState.queue.shift()
      if (!next) throw new Error('no scripted Anthropic response')
      if (next.throwName) {
        const err = new Error('aborted')
        err.name = next.throwName
        throw err
      }
      return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── KV stub (typed as the minimal RateLimitStore slice — no cast) ────────────
function makeKv(initial: Record<string, string> = {}): RateLimitStore {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

// ASSETS is never touched; a typed stub satisfies Fetcher without a cast.
const noopFetcher: Fetcher = {
  fetch: () => Promise.resolve(new Response(null)),
  connect: () => {
    throw new Error('ASSETS.connect is not used in these tests')
  },
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: noopFetcher,
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    ANTHROPIC_API_KEY: 'sk-test',
    AI_RATE_LIMIT: makeKv(),
    ...overrides,
  }
}

function post(opts: { token?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.token !== undefined) headers.authorization = `Bearer ${opts.token}`
  return new Request('https://app.example/api/ai', {
    method: 'POST',
    headers,
    body: opts.body === undefined ? JSON.stringify({ message: 'เงินเหลือเท่าไหร่' }) : JSON.stringify(opts.body),
  })
}

async function bodyOf(res: Response): Promise<{ error?: string; reply?: string }> {
  return (await res.json()) as { error?: string; reply?: string }
}

/** A fully authorised, consenting user (so tests can focus on later gates). */
function authorise(uid = 'user-1') {
  state.getUser = { data: { user: { id: uid } }, error: null }
  state.consent = { data: { consent: true }, error: null }
}

describe('handleAi — gates reject BEFORE any Anthropic call (the money guard)', () => {
  it('non-POST → 405, no client, no Anthropic', async () => {
    const res = await handleAi(new Request('https://app.example/api/ai', { method: 'GET' }), makeEnv())
    expect(res.status).toBe(405)
    expect(state.createClientCalls).toBe(0)
    expect(fetchState.calls).toBe(0)
  })

  it('no token → 401, no Anthropic', async () => {
    const res = await handleAi(post(), makeEnv())
    expect(res.status).toBe(401)
    expect((await bodyOf(res)).error).toBe(SESSION_EXPIRED)
    expect(state.createClientCalls).toBe(0)
    expect(fetchState.calls).toBe(0)
  })

  it('rejected token (expired/revoked) → 401, no Anthropic', async () => {
    state.getUser = { data: { user: null }, error: { status: 401 } }
    const res = await handleAi(post({ token: 'expired' }), makeEnv())
    expect(res.status).toBe(401)
    expect(state.authHeader).toBe('Bearer expired')
    expect(fetchState.calls).toBe(0)
  })

  it('no consent row → 403, no Anthropic', async () => {
    state.getUser = { data: { user: { id: 'user-1' } }, error: null }
    state.consent = { data: null, error: null }
    const res = await handleAi(post({ token: 'tok' }), makeEnv())
    expect(res.status).toBe(403)
    expect((await bodyOf(res)).error).toBe(NO_CONSENT)
    expect(fetchState.calls).toBe(0)
  })

  it('consent=false → 403, no Anthropic', async () => {
    state.getUser = { data: { user: { id: 'user-1' } }, error: null }
    state.consent = { data: { consent: false }, error: null }
    const res = await handleAi(post({ token: 'tok' }), makeEnv())
    expect(res.status).toBe(403)
    expect(fetchState.calls).toBe(0)
  })

  it('over the per-minute rate limit → 429, no Anthropic', async () => {
    authorise()
    const bucket = Math.floor(Date.now() / 60_000)
    const kv = makeKv({ [`rl:min:user-1:${bucket}`]: String(RL_PER_MINUTE) })
    const res = await handleAi(post({ token: 'tok' }), makeEnv({ AI_RATE_LIMIT: kv }))
    expect(res.status).toBe(429)
    expect(fetchState.calls).toBe(0)
  })

  it('over the per-day rate limit → 429, no Anthropic', async () => {
    authorise()
    const day = Math.floor(Date.now() / 86_400_000)
    const kv = makeKv({ [`rl:day:user-1:${day}`]: String(RL_PER_DAY) })
    const res = await handleAi(post({ token: 'tok' }), makeEnv({ AI_RATE_LIMIT: kv }))
    expect(res.status).toBe(429)
    expect(fetchState.calls).toBe(0)
  })
})

describe('handleAi — server misconfiguration fails closed', () => {
  it('missing Supabase config → 503, no Anthropic', async () => {
    const res = await handleAi(
      post({ token: 'tok' }),
      makeEnv({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined }),
    )
    expect(res.status).toBe(503)
    expect(fetchState.calls).toBe(0)
  })

  it('no ANTHROPIC key → 503 (after consent), no Anthropic', async () => {
    authorise()
    const res = await handleAi(post({ token: 'tok' }), makeEnv({ ANTHROPIC_API_KEY: undefined }))
    expect(res.status).toBe(503)
    expect((await bodyOf(res)).error).toContain('ANTHROPIC_API_KEY')
    expect(fetchState.calls).toBe(0)
  })

  it('missing KV binding → 503 (fail closed, uncapped spend not allowed)', async () => {
    authorise()
    const res = await handleAi(post({ token: 'tok' }), makeEnv({ AI_RATE_LIMIT: undefined }))
    expect(res.status).toBe(503)
    expect(fetchState.calls).toBe(0)
  })
})

describe('handleAi — request body', () => {
  it('empty/blank message → 400, no Anthropic', async () => {
    authorise()
    const res = await handleAi(post({ token: 'tok', body: { message: '   ' } }), makeEnv())
    expect(res.status).toBe(400)
    expect(fetchState.calls).toBe(0)
  })

  it('identity comes from the token, never the body user_id', async () => {
    authorise('verified-uid')
    fetchState.queue = [anthropicText('เงินรวม ฿100 จากยอดคงเหลือกระเป๋า')]
    const res = await handleAi(
      post({ token: 'tok', body: { message: 'เงินเหลือเท่าไหร่', user_id: 'attacker-uid' } }),
      makeEnv(),
    )
    expect(res.status).toBe(200)
    // consent read was scoped to the token's uid, not the body value
    expect(state.eqColumn).toBe('user_id')
    expect(state.eqValue).toBe('verified-uid')
  })
})

describe('handleAi — happy path + tool loop', () => {
  it('all gates pass → Anthropic called → 200 with a reply', async () => {
    authorise()
    fetchState.queue = [anthropicText('เงินรวม ฿250 (จากยอดคงเหลือกระเป๋า)')]
    const res = await handleAi(post({ token: 'tok' }), makeEnv())
    expect(res.status).toBe(200)
    expect((await bodyOf(res)).reply).toBe('เงินรวม ฿250 (จากยอดคงเหลือกระเป๋า)')
    expect(fetchState.calls).toBe(1)
  })

  it('tool_use → runs wallet_balances under the user JWT → answers (2 calls)', async () => {
    authorise()
    state.rpc = { data: [{ wallet_id: 'w1', balance: 250 }], error: null }
    fetchState.queue = [anthropicToolUse('tu_1', 'wallet_balances'), anthropicText('เหลือ ฿250')]
    const res = await handleAi(post({ token: 'tok' }), makeEnv())
    expect(res.status).toBe(200)
    expect((await bodyOf(res)).reply).toBe('เหลือ ฿250')
    expect(state.rpcCalls).toEqual(['wallet_balances'])
    expect(fetchState.calls).toBe(2)
  })

  it('model loops tools forever → capped at AI_MAX_MODEL_CALLS, then stops', async () => {
    authorise()
    state.rpc = { data: [], error: null }
    // Every call asks for a tool again; the loop must NOT run unbounded.
    fetchState.queue = Array.from({ length: 10 }, (_, i) => anthropicToolUse(`tu_${i}`, 'wallet_balances'))
    const res = await handleAi(post({ token: 'tok' }), makeEnv())
    expect(res.status).toBe(200)
    // 3 = AI_MAX_MODEL_CALLS — the loop stopped rather than draining the queue.
    expect(fetchState.calls).toBe(3)
  })
})

describe('handleAi — upstream errors map to Thai 502/504 without leaking', () => {
  it('Anthropic timeout → 504', async () => {
    authorise()
    fetchState.queue = [{ throwName: 'TimeoutError' }]
    const res = await handleAi(post({ token: 'tok' }), makeEnv())
    expect(res.status).toBe(504)
    expect((await bodyOf(res)).error).not.toMatch(/anthropic|sk-|timeout/i)
  })

  it('Anthropic 529 overloaded → 502', async () => {
    authorise()
    fetchState.queue = [{ status: 529, body: { error: 'overloaded' } }]
    const res = await handleAi(post({ token: 'tok' }), makeEnv())
    expect(res.status).toBe(502)
    expect((await bodyOf(res)).error).not.toMatch(/overloaded|anthropic|529/i)
  })
})

describe('AI_TOOLS schema — no field can identify a user/wallet (design §3.4)', () => {
  it('every tool takes zero parameters', () => {
    for (const tool of AI_TOOLS) {
      expect(Object.keys(tool.input_schema.properties)).toHaveLength(0)
      expect(tool.input_schema.additionalProperties).toBe(false)
    }
  })
})
