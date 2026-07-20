/**
 * Cloudflare Pages Function — AI proxy (placeholder).
 *
 * Purpose: keep the Anthropic API key SERVER-SIDE only. The client calls
 * `POST /api/ai`; this function reads ANTHROPIC_API_KEY from the Pages
 * environment (never exposed to the browser) and forwards to the Anthropic API.
 *
 * AI is NOT implemented yet (design spec: reserve the seam, build later).
 * This returns 501 so the route + env wiring exist and can be filled in.
 *
 * To enable later:
 *   1. Cloudflare Pages → Settings → Environment variables → add ANTHROPIC_API_KEY (secret)
 *   2. Implement the fetch to https://api.anthropic.com/v1/messages below.
 */

interface Env {
  ANTHROPIC_API_KEY?: string
}

export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'AI ยังไม่ได้ตั้งค่า (ไม่มี ANTHROPIC_API_KEY ฝั่ง server)' }, 503)
  }

  // TODO(ai): forward the request body to the Anthropic Messages API using
  // structured output / tool use, then return the structured actions.
  return json({ error: 'ยังไม่เปิดใช้งานฟีเจอร์ AI' }, 501)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
