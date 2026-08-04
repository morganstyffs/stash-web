/**
 * Cloudflare Worker entry — serves the built SPA (static assets via the ASSETS
 * binding) and hosts the server-side API routes.
 *
 * Deploy model: Cloudflare Workers with static assets (NOT Pages). The Vite
 * build output in ./dist is uploaded as assets; wrangler.jsonc wires the
 * ASSETS binding and SPA not-found handling. This Worker only needs to handle
 * dynamic routes (/api/*) — anything else falls through to ASSETS, and
 * `not_found_handling: "single-page-application"` rewrites unknown paths to
 * index.html so client-side (react-router) routing works.
 */

import { handleAi } from './ai'
import { json } from './json'
import { withSecurityHeaders } from './security'

export interface Env {
  /** Static assets binding (see wrangler.jsonc → assets.binding). */
  ASSETS: Fetcher
  /**
   * Server-side secret — set via `npx wrangler secret put ANTHROPIC_API_KEY`
   * or the Cloudflare dashboard. NEVER exposed to the client.
   */
  ANTHROPIC_API_KEY?: string
  /**
   * Supabase project URL + anon (public) key, needed so /api/ai can verify the
   * caller's JWT (`auth.getUser`) and read their data UNDER RLS with a
   * per-request client (see worker/ai.ts). Set as plain runtime vars via the
   * Cloudflare dashboard (or `wrangler secret put`) — the same server-side
   * binding pattern as ANTHROPIC_API_KEY, so they are NOT hardcoded and NOT in
   * wrangler.jsonc. The anon key is safe to hold here because every table
   * enforces RLS (auth.uid() = user_id); service_role is NEVER used.
   */
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
}

export default {
  async fetch(request, env): Promise<Response> {
    // Single exit point so security headers are applied to every response
    // (assets, API routes, and the error fallback alike).
    return withSecurityHeaders(await route(request, env))
  },
} satisfies ExportedHandler<Env>

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  // Server-side API routes.
  if (url.pathname.startsWith('/api/')) {
    try {
      if (url.pathname === '/api/ai') {
        return await handleAi(request, env)
      }
      return json({ error: 'ไม่พบเส้นทาง API ที่ร้องขอ' }, 404)
    } catch (err) {
      // Log the real error to Cloudflare (Workers Logs / `wrangler tail`), but
      // never leak internals (stack traces, upstream messages) to the client.
      console.error('API route error:', url.pathname, err)
      return json({ error: 'เกิดข้อผิดพลาดภายในระบบ' }, 500)
    }
  }

  // Everything else → static assets (the SPA).
  return env.ASSETS.fetch(request)
}
