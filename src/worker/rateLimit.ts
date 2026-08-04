/**
 * Per-user rate limit for /api/ai, backed by KV (binding AI_RATE_LIMIT).
 *
 * Two windows, BOTH keyed to the verified uid (never to an IP or any
 * client-supplied id — the design forbids trusting client identity):
 *   - per-minute: stops a client from hammering / a stuck loop from firing fast
 *   - per-day:    the real ceiling on how much money one user can cost the
 *                 owner in a day (each request can hit Anthropic)
 *
 * ⚠️ THESE COUNTS ARE NOT EXACT. KV is eventually consistent and this is a
 * read-modify-write with no compare-and-set, so two concurrent requests can
 * both read the same value and both pass — the effective ceiling can overshoot
 * by roughly the number of in-flight requests, and a just-written value may not
 * be visible to a request on another edge for a short window. That is accepted:
 * there are only a few users and the goal is to stop runaway spend, not to
 * meter to the exact request. Do NOT describe these caps as precise anywhere.
 */

/** Requests per rolling-ish minute bucket. */
export const RL_PER_MINUTE = 10
/** Requests per day bucket — the financial-damage ceiling (matters more). */
export const RL_PER_DAY = 100

export interface RateDecision {
  allowed: boolean
  /** Which window blocked, so the caller can word the 429 (and pick a retry hint). */
  scope?: 'minute' | 'day'
}

/**
 * The minimal slice of KV this module uses. A real Cloudflare `KVNamespace`
 * satisfies it structurally, so the binding is typed as this (see Env) rather
 * than the full namespace — it documents exactly what the worker touches and
 * lets tests pass a plain stub without a cast (convention 12).
 */
export interface RateLimitStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

/**
 * Read both counters; if either is at its ceiling, block. Otherwise record this
 * attempt (increment both) and allow. The attempt is counted BEFORE the
 * Anthropic call, so an upstream failure still consumes quota — the
 * conservative choice for the owner's budget. TTLs bound KV growth: minute keys
 * expire in ~2 min, day keys within a day.
 *
 * `nowMs` is injected (not read inside) so the logic is deterministic and
 * testable.
 */
export async function checkRateLimit(
  kv: RateLimitStore,
  uid: string,
  nowMs: number,
): Promise<RateDecision> {
  const minuteKey = `rl:min:${uid}:${Math.floor(nowMs / MINUTE_MS)}`
  const dayKey = `rl:day:${uid}:${Math.floor(nowMs / DAY_MS)}`

  const [minRaw, dayRaw] = await Promise.all([kv.get(minuteKey), kv.get(dayKey)])
  const minCount = minRaw ? parseInt(minRaw, 10) || 0 : 0
  const dayCount = dayRaw ? parseInt(dayRaw, 10) || 0 : 0

  // Day ceiling checked first — it's the one that protects the wallet.
  if (dayCount >= RL_PER_DAY) return { allowed: false, scope: 'day' }
  if (minCount >= RL_PER_MINUTE) return { allowed: false, scope: 'minute' }

  await Promise.all([
    kv.put(minuteKey, String(minCount + 1), { expirationTtl: 120 }),
    kv.put(dayKey, String(dayCount + 1), { expirationTtl: 86_400 }),
  ])
  return { allowed: true }
}
