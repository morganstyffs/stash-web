/**
 * AI proxy (placeholder) — moved from the former Cloudflare Pages Function
 * (functions/api/ai.ts) into the Worker.
 *
 * Purpose: keep the Anthropic API key SERVER-SIDE only. The client calls
 * `POST /api/ai`; this handler reads ANTHROPIC_API_KEY from the Worker
 * environment (a runtime secret, never exposed to the browser) and will forward
 * to the Anthropic API.
 *
 * AI is NOT implemented yet (design spec: reserve the seam, build later).
 * This returns 501 so the route + env wiring exist and can be filled in.
 *
 * To enable later:
 *   1. Cloudflare dashboard → Workers → stash-web → Settings → Variables and Secrets
 *      → add ANTHROPIC_API_KEY (encrypted secret), or run
 *      `npx wrangler secret put ANTHROPIC_API_KEY`.
 *   2. Implement the fetch to https://api.anthropic.com/v1/messages below.
 */

import type { Env } from './index'
import { json } from './json'

export async function handleAi(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405)
  }

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'AI ยังไม่ได้ตั้งค่า (ไม่มี ANTHROPIC_API_KEY ฝั่ง server)' }, 503)
  }

  // TODO(ai): forward the request body to the Anthropic Messages API using
  // structured output / tool use, then return the structured actions.
  return json({ error: 'ยังไม่เปิดใช้งานฟีเจอร์ AI' }, 501)
}
