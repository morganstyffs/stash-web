import { describe, it, expect } from 'vitest'
import http from 'node:http'
import { readFileSync, writeFileSync, rmSync, cpSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server } from 'node:http'

/**
 * Real-browser guard for the "frozen bundle" bug (production sat on #66 for four
 * merges because the service worker served index.html cache-first).
 *
 * A unit test can't see this: the freeze is a service-worker + HTTP behaviour, not
 * anything in a rendered component. So this drives the REAL generated dist/sw.js in
 * real Chromium across a simulated deploy:
 *
 *   1. serve the built dist (v1) and let the SW install + control the page
 *   2. "deploy v2": swap index.html so its module <script> points to a renamed copy
 *      of the main chunk — the bundle pointer, the exact thing that was frozen
 *   3. reopen and assert the returning client runs the v2 chunk, not the v1 one
 *
 * Runs RED on the old cache-first config (client stays on v1) → GREEN once the shell
 * is served network-first. Skip/fail policy mirrors the other visual guards:
 * outside CI with no launchable Chromium → skip; in CI → fail (CI provisions it).
 */

const IN_CI = !!process.env.CI

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const chunkHash = (s: string | null) => (s ? (s.match(/index-([A-Za-z0-9_-]+)\.js/) || [])[1] : undefined)

describe('PWA delivers a fresh version to a returning client (real browser)', () => {
  it(
    'after a deploy, a reopened client runs the new bundle — not a precached shell',
    async (ctx) => {
      if (!existsSync('dist/sw.js') || !existsSync('dist/index.html')) {
        const reason = '[pwa-freshness] no built dist/sw.js — run `npm run build` before `npm test`'
        if (IN_CI) throw new Error(reason)
        // eslint-disable-next-line no-console
        console.warn(`${reason} (local, not CI) — skipping`)
        ctx.skip()
        return
      }

      // Launch Chromium first, so the skip/fail decision happens before any setup.
      const { chromium } = await import('playwright-core')
      let browser
      try {
        browser = await chromium.launch({
          executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
          args: ['--no-sandbox'],
        })
      } catch (err) {
        const detail = err instanceof Error ? err.message.split('\n')[0] : String(err)
        const reason = `[pwa-freshness] could not launch Chromium (${detail})`
        if (IN_CI) {
          throw new Error(
            `${reason} — CI must provision Chromium: add ` +
              '`npx playwright-core install --with-deps chromium` before `npm test` in .github/workflows/ci.yml',
          )
        }
        // eslint-disable-next-line no-console
        console.warn(`${reason} (local, not CI) — skipping`)
        ctx.skip()
        return
      }

      // Served dir = the built dist (v1); prepare a v2 that points at a renamed chunk.
      const served = join(tmpdir(), 'stash-pwa-freshness')
      rmSync(served, { recursive: true, force: true })
      cpSync('dist', served, { recursive: true })
      const indexV1 = readFileSync(join(served, 'index.html'), 'utf8')
      const m = indexV1.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)
      if (!m) throw new Error('no main chunk found in built index.html')
      const chunkV1 = m[1]
      const chunkV2 = 'index-FRESHDEPLOYGUARD.js'
      cpSync(join(served, 'assets', chunkV1), join(served, 'assets', chunkV2))
      const indexV2 = indexV1.replace(chunkV1, chunkV2)

      const server: Server = http.createServer((req, res) => {
        let p = decodeURIComponent((req.url || '/').split('?')[0])
        if (p === '/') p = '/index.html'
        try {
          const buf = readFileSync(served + p)
          const ext = p.slice(p.lastIndexOf('.'))
          res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
          // mimic a normal static host: hashed assets immutable, sw.js/html revalidated
          res.setHeader(
            'Cache-Control',
            p.endsWith('sw.js') || p.endsWith('.html') ? 'no-cache' : 'max-age=31536000',
          )
          res.end(buf)
        } catch {
          res.statusCode = 404
          res.end('not found')
        }
      })
      await new Promise<void>((r) => server.listen(0, r))
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      const url = `http://localhost:${port}/`

      try {
        const page = await browser.newPage()
        const scriptSrc = () =>
          page.evaluate(() => {
            const s = document.querySelector('script[type=module]')
            return s ? s.getAttribute('src') : null
          })

        // 1) first open (v1) — register the SW manually (the app needs a backend to
        // boot; the SW's serving behaviour, which is what we test, does not).
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await page.evaluate(async () => {
          await navigator.serviceWorker.register('/sw.js')
          await navigator.serviceWorker.ready
        })
        // wait until the SW actually controls the page (reload up to a few times)
        for (let i = 0; i < 8; i++) {
          if (await page.evaluate(() => !!navigator.serviceWorker.controller)) break
          await sleep(400)
          await page.reload({ waitUntil: 'load' })
        }
        const baseline = chunkHash(await scriptSrc())
        expect(baseline, 'baseline should be the v1 chunk').toBe(chunkHash(chunkV1))

        // 2) "deploy v2": the server now hands out the new bundle pointer.
        writeFileSync(join(served, 'index.html'), indexV2)

        // 3) reopen (full navigation, bypassing bfcache) — the returning client must
        // run the v2 chunk. Cache-first shell → still v1 (RED); network-first → v2.
        await page.goto('about:blank')
        await page.goto(url, { waitUntil: 'load' })
        await sleep(500)
        const after = chunkHash(await scriptSrc())
        expect(after, 'a reopened client must load the freshly deployed bundle').toBe(
          chunkHash(chunkV2),
        )
      } finally {
        await browser.close()
        server.close()
        rmSync(served, { recursive: true, force: true })
      }
    },
    60_000,
  )
})
