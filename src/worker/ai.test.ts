import { describe, it, expect, beforeEach, vi } from 'vitest'

// First worker test in the repo. It exercises the /api/ai identity + consent
// gates (PR-1a) without any network by mocking @supabase/supabase-js. The mock
// records what the handler did (which token it verified, which uid it bound the
// consent read to, whether it built a per-request client with the user's JWT)
// so we can assert the security properties, not just the status codes.
//
// State is created via vi.hoisted so the hoisted vi.mock factory below can
// reference it. Each test sets `state.*` and beforeEach resets it.
const state = vi.hoisted(() => ({
  // What auth.getUser returns for the test.
  getUser: { data: { user: null as { id: string } | null }, error: null as { status?: number } | null },
  // What the ai_settings read returns.
  consent: { data: null as { consent?: boolean } | null, error: null as unknown },
  // Recorded by the mock so tests can assert behaviour.
  createClientCalls: 0,
  authHeader: undefined as string | undefined,
  getUserArg: undefined as string | undefined,
  eqColumn: undefined as string | undefined,
  eqValue: undefined as string | undefined,
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
      auth: {
        getUser: async (jwt?: string) => {
          state.getUserArg = jwt
          return state.getUser
        },
      },
      from: () => ({
        select: () => ({
          eq: (column: string, value: string) => {
            state.eqColumn = column
            state.eqValue = value
            return { maybeSingle: async () => state.consent }
          },
        }),
      }),
    }
  },
}))

// Imported AFTER the mock is declared (vi.mock is hoisted above imports anyway).
import { handleAi } from './ai'
import type { Env } from './index'

const SESSION_EXPIRED = 'เซสชันหมดอายุ เข้าสู่ระบบใหม่'
const NO_CONSENT = 'ยังไม่ได้เปิดใช้ผู้ช่วย AI — เปิดได้ในหน้าตั้งค่า'

// ASSETS is never touched by handleAi; a typed stub satisfies the Fetcher shape
// without a cast (fewer-param functions are assignable; connect just throws).
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
    ...overrides,
  }
}

function post(opts: { token?: string; body?: unknown } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.token !== undefined) headers.authorization = `Bearer ${opts.token}`
  return new Request('https://app.example/api/ai', {
    method: 'POST',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
}

async function bodyOf(res: Response): Promise<{ error?: string }> {
  return (await res.json()) as { error?: string }
}

beforeEach(() => {
  state.getUser = { data: { user: null }, error: null }
  state.consent = { data: null, error: null }
  state.createClientCalls = 0
  state.authHeader = undefined
  state.getUserArg = undefined
  state.eqColumn = undefined
  state.eqValue = undefined
})

describe('handleAi — method + token gate (before any DB / Anthropic work)', () => {
  it('rejects non-POST with 405 and never builds a client', async () => {
    const res = await handleAi(
      new Request('https://app.example/api/ai', { method: 'GET' }),
      makeEnv(),
    )
    expect(res.status).toBe(405)
    expect(state.createClientCalls).toBe(0)
  })

  it('rejects a request with no Authorization header with 401', async () => {
    const res = await handleAi(post(), makeEnv())
    expect(res.status).toBe(401)
    expect((await bodyOf(res)).error).toBe(SESSION_EXPIRED)
    // Verify-first: no token → rejected before any Supabase client is built.
    expect(state.createClientCalls).toBe(0)
  })

  it('rejects a malformed Authorization header (no Bearer token) with 401', async () => {
    const req = new Request('https://app.example/api/ai', {
      method: 'POST',
      headers: { authorization: 'Bearer   ' },
    })
    const res = await handleAi(req, makeEnv())
    expect(res.status).toBe(401)
    expect(state.createClientCalls).toBe(0)
  })
})

describe('handleAi — server misconfiguration fails closed', () => {
  it('returns 503 (not 401/500) when Supabase config is absent', async () => {
    const env = makeEnv({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined })
    const res = await handleAi(post({ token: 'tok' }), env)
    expect(res.status).toBe(503)
    // Never verified anything / built a client without config.
    expect(state.createClientCalls).toBe(0)
  })
})

describe('handleAi — token verification (auth.getUser)', () => {
  it('returns 401 when the token is rejected (expired / revoked, status 401)', async () => {
    state.getUser = { data: { user: null }, error: { status: 401 } }
    const res = await handleAi(post({ token: 'expired' }), makeEnv())
    expect(res.status).toBe(401)
    expect((await bodyOf(res)).error).toBe(SESSION_EXPIRED)
    // The per-request client carried the caller's JWT, and getUser verified it.
    expect(state.authHeader).toBe('Bearer expired')
    expect(state.getUserArg).toBe('expired')
  })

  it('returns 401 when getUser yields no user and no error', async () => {
    state.getUser = { data: { user: null }, error: null }
    const res = await handleAi(post({ token: 'tok' }), makeEnv())
    expect(res.status).toBe(401)
  })

  it('rethrows (→ index.ts 500) on a Supabase outage rather than pretending 401', async () => {
    state.getUser = { data: { user: null }, error: { status: 503 } }
    await expect(handleAi(post({ token: 'tok' }), makeEnv())).rejects.toBeTruthy()
  })
})

describe('handleAi — consent gate (3 cases per design §3.5.1)', () => {
  it('no ai_settings row (data=null) → 403, not 500', async () => {
    state.getUser = { data: { user: { id: 'user-1' } }, error: null }
    state.consent = { data: null, error: null }
    const res = await handleAi(post({ token: 'tok' }), makeEnv())
    expect(res.status).toBe(403)
    expect((await bodyOf(res)).error).toBe(NO_CONSENT)
  })

  it('consent=false → 403', async () => {
    state.getUser = { data: { user: { id: 'user-1' } }, error: null }
    state.consent = { data: { consent: false }, error: null }
    const res = await handleAi(post({ token: 'tok' }), makeEnv())
    expect(res.status).toBe(403)
  })

  it('consent=true → passes both gates (endpoint still 501 with a key)', async () => {
    state.getUser = { data: { user: { id: 'user-1' } }, error: null }
    state.consent = { data: { consent: true }, error: null }
    const res = await handleAi(post({ token: 'tok' }), makeEnv({ ANTHROPIC_API_KEY: 'sk-test' }))
    expect(res.status).toBe(501)
  })

  it('a real DB error on the consent read rethrows (→ 500), never a silent pass', async () => {
    state.getUser = { data: { user: { id: 'user-1' } }, error: null }
    state.consent = { data: null, error: { code: 'PGRST500' } }
    await expect(handleAi(post({ token: 'tok' }), makeEnv())).rejects.toBeTruthy()
  })
})

describe('handleAi — identity comes only from the token, never the body', () => {
  it('binds the consent read to the verified uid, ignoring a spoofed body user_id', async () => {
    state.getUser = { data: { user: { id: 'verified-uid' } }, error: null }
    state.consent = { data: { consent: true }, error: null }
    const res = await handleAi(
      post({ token: 'tok', body: { user_id: 'attacker-uid', question: 'hi' } }),
      makeEnv({ ANTHROPIC_API_KEY: 'sk-test' }),
    )
    expect(res.status).toBe(501)
    // The read was scoped to the token's uid — the body value was never used.
    expect(state.eqColumn).toBe('user_id')
    expect(state.eqValue).toBe('verified-uid')
  })
})

describe('handleAi — order: existing 503 (no key) stays, but after auth/consent', () => {
  it('a valid consenting user with no ANTHROPIC key gets 503 (not 501)', async () => {
    state.getUser = { data: { user: { id: 'user-1' } }, error: null }
    state.consent = { data: { consent: true }, error: null }
    const res = await handleAi(post({ token: 'tok' }), makeEnv())
    expect(res.status).toBe(503)
    expect((await bodyOf(res)).error).toContain('ANTHROPIC_API_KEY')
  })

  it('an unauthenticated caller never reaches the no-key 503 (gets 401 first)', async () => {
    // No key set, no token: the token gate wins, proving order.
    const res = await handleAi(post(), makeEnv())
    expect(res.status).toBe(401)
  })
})
