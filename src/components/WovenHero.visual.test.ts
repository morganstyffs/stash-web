import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { WovenHero } from '@/components/WovenHero'

/**
 * Visual regression guard for the folded hero labels.
 *
 * The bug this catches: a woven label is a <button>, and a <button> vertically
 * CENTRES its content. With the label fixed at 158px tall the ~41px header strip
 * gets centred ~64px down — below the 48px a folded label peeks — so BUDGET /
 * STOCK PROFIT (eyebrow + figure) end up painted behind the label in front and
 * read as blank fabric on the real screen. jsdom does not model button content
 * centring, so a "is the text in the DOM" test (WovenHero.test.tsx) passed the
 * whole time the bug was live. This renders the real component with the real
 * compiled CSS in real Chromium and asserts, via elementFromPoint, that each
 * folded eyebrow is the element actually painted at its own centre.
 *
 * Browser resolution: playwright-core finds its OWN installed browser (no path
 * guessing). Set CHROMIUM_EXECUTABLE to point at a specific binary if a sandbox
 * ships a different revision than this playwright-core expects.
 *
 * Runnability policy — a guard that can never fail where it matters is no guard
 * (cf. the `tsc --noEmit`-on-0-files trap this project already hit):
 *   • outside CI, browser not launchable → skip (dev box may have no Chromium)
 *   • in CI (process.env.CI set), browser not launchable → FAIL, because CI is
 *     supposed to provision it (see .github/workflows/ci.yml). The error says
 *     exactly what to add.
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

describe('WovenHero folded labels are actually visible (real browser)', () => {
  it(
    'BUDGET and STOCK PROFIT eyebrows + figures are the painted element at their own centre',
    async (ctx) => {
      const css = findBuiltCss()
      if (!css) {
        const msg = 'no production CSS at dist/assets — run `npm run build` before `npm test`'
        if (IN_CI) throw new Error(`[WovenHero.visual] ${msg}`)
        // eslint-disable-next-line no-console
        console.warn(`[WovenHero.visual] skipped: ${msg} (local, not CI)`)
        ctx.skip()
        return
      }

      const { chromium } = await import('playwright-core')
      // undefined → playwright-core resolves its own installed browser.
      const executablePath = process.env.CHROMIUM_EXECUTABLE || undefined

      let browser
      try {
        browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
      } catch (err) {
        const detail = err instanceof Error ? err.message.split('\n')[0] : String(err)
        const msg =
          `could not launch Chromium (${detail}). CI must provision it — add ` +
          '`npx playwright-core install --with-deps chromium` before `npm test` in ' +
          '.github/workflows/ci.yml'
        if (IN_CI) throw new Error(`[WovenHero.visual] ${msg}`)
        // eslint-disable-next-line no-console
        console.warn(`[WovenHero.visual] skipped: ${msg} (local, not CI)`)
        ctx.skip()
        return
      }

      try {
        const markup = renderToStaticMarkup(
          createElement(
            MemoryRouter,
            null,
            createElement(WovenHero, {
              safeToSpend: 9_000,
              daysLeft: 10,
              dailyAllowance: 900,
              deltaPct: null,
              budgetTotal: 10_000,
              budgetSpending: 4_000,
              stock: { revenue: 5_000, cogs: 3_200, profit: 1_800, sale_count: 3, qty_sold: 4 },
              hideBalance: false,
              onToggleHide: () => {},
            }),
          ),
        )
        const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<style>${css}</style><style>body{margin:0}#stage{width:390px;padding:16px}</style></head>
<body><div id="stage">${markup}</div></body></html>`

        const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
        await page.setContent(html)

        // For each label expected to peek, the pixel at the centre of its eyebrow
        // (and folded figure) must belong to THAT label — 'SELF' — i.e. nothing
        // is painted over it. Returns the covering label's aria-label otherwise.
        const ownerAt = (text: string) =>
          page.evaluate((t) => {
            const el = [...document.querySelectorAll('span,p')].find(
              (s) => (s.textContent || '').trim() === t,
            )
            if (!el) return 'NOT-IN-DOM'
            const b = el.getBoundingClientRect()
            if (b.width === 0 || b.height === 0) return 'ZERO-SIZE'
            const top = document.elementFromPoint(
              Math.round(b.left + b.width / 2),
              Math.round(b.top + b.height / 2),
            )
            if (!top) return 'NONE'
            if (top === el || el.contains(top)) return 'SELF'
            let btn: Element | null = top
            while (btn && btn.tagName !== 'BUTTON') btn = btn.parentElement
            return btn ? `COVERED:${btn.getAttribute('aria-label')}` : `COVERED:${top.tagName}`
          }, text)

        expect(await ownerAt('BUDGET')).toBe('SELF')
        expect(await ownerAt('STOCK PROFIT')).toBe('SELF')
        expect(await ownerAt('฿10,000')).toBe('SELF') // budget folded figure
        expect(await ownerAt('฿1,800')).toBe('SELF') // stock folded figure
      } finally {
        await browser.close()
      }
    },
    60_000,
  )
})
