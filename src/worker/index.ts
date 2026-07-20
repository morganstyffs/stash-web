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

export interface Env {
  /** Static assets binding (see wrangler.jsonc → assets.binding). */
  ASSETS: Fetcher
  /**
   * Server-side secret — set via `npx wrangler secret put ANTHROPIC_API_KEY`
   * or the Cloudflare dashboard. NEVER exposed to the client.
   */
  ANTHROPIC_API_KEY?: string
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)

    // Server-side API routes.
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/ai') {
        return handleAi(request, env)
      }
      return json({ error: 'ไม่พบเส้นทาง API ที่ร้องขอ' }, 404)
    }

    // Everything else → static assets (the SPA).
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
