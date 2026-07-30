import { readdirSync, readFileSync } from 'node:fs'
import type { Page } from 'playwright-core'

/**
 * Shared plumbing for the real-browser visual guards (WovenHero.visual.test.ts,
 * charts.visual.test.ts). One place owns: finding the production CSS, resolving
 * a Chromium binary, and the skip-vs-fail policy. A guard that can only ever skip
 * where it matters is no guard (cf. the `tsc --noEmit`-on-0-files trap this
 * project hit), so:
 *   • outside CI, Chromium not launchable → skip (a dev box may have none)
 *   • in CI (process.env.CI set), Chromium not launchable → FAIL, because CI is
 *     supposed to provision it; the error names the exact workflow line to add.
 * Browser resolution goes through playwright-core itself (no path guessing);
 * CHROMIUM_EXECUTABLE is an explicit override for a sandbox on a different build.
 */

const IN_CI = !!process.env.CI

function findBuiltCss(): string | null {
  try {
    const file = readdirSync('dist/assets').find((f) => f.endsWith('.css'))
    return file ? readFileSync(`dist/assets/${file}`, 'utf8') : null
  } catch {
    return null
  }
}

/** Minimal shape of the Vitest test context bits we use (avoids a type import). */
interface SkippableCtx {
  skip: () => void
}

function failOrSkip(ctx: SkippableCtx, name: string, reason: string): void {
  const base = `[${name}] ${reason}`
  if (IN_CI) {
    throw new Error(
      `${base} — CI must provision Chromium: add ` +
        '`npx playwright-core install --with-deps chromium` before `npm test` in ' +
        '.github/workflows/ci.yml',
    )
  }
  // eslint-disable-next-line no-console
  console.warn(`${base} (local, not CI) — skipping`)
  ctx.skip()
}

/**
 * Render `markup` inside a 390px stage with the production CSS, in real Chromium,
 * and run `assert(page)`. `headHtml` lets a guard add e.g. the Prompt font link.
 * Honours the skip/fail policy above; the caller's `assert` does the real checks.
 */
export async function runVisualTest(
  ctx: SkippableCtx,
  opts: { name: string; markup: string; headHtml?: string; viewport?: { width: number; height: number } },
  assert: (page: Page) => Promise<void>,
): Promise<void> {
  const css = findBuiltCss()
  if (!css) {
    failOrSkip(ctx, opts.name, 'no production CSS at dist/assets — run `npm run build` before `npm test`')
    return
  }

  const { chromium } = await import('playwright-core')
  let browser
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
      args: ['--no-sandbox'],
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message.split('\n')[0] : String(err)
    failOrSkip(ctx, opts.name, `could not launch Chromium (${detail})`)
    return
  }

  try {
    const page = await browser.newPage({ viewport: opts.viewport ?? { width: 390, height: 800 } })
    const html =
      `<!doctype html><html lang="th"><head><meta charset="utf-8">${opts.headHtml ?? ''}` +
      `<style>${css}</style><style>body{margin:0}#stage{width:390px;padding:16px}</style>` +
      `</head><body><div id="stage">${opts.markup}</div></body></html>`
    await page.setContent(html)
    await assert(page)
  } finally {
    await browser.close()
  }
}
