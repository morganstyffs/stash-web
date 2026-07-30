import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
 * whole time the bug was live. This test renders the real component with the
 * real compiled CSS in real Chromium and asserts, via elementFromPoint, that
 * each folded eyebrow is the element actually painted at its own centre — which
 * is false when the label in front covers it.
 *
 * Runs wherever a Chromium binary + a production CSS build are available (this
 * sandbox, local dev). It skips (rather than fails) when either is missing so a
 * browser-less `npm test` stays green; `npm run build` before `npm test` gives
 * it the CSS.
 */

function findChromium(): string | null {
  const envPath = process.env.CHROMIUM_EXECUTABLE
  if (envPath && existsSync(envPath)) return envPath
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  try {
    const dir = readdirSync(base).find((d) => /^chromium-\d+$/.test(d))
    if (dir) {
      const exe = `${base}/${dir}/chrome-linux/chrome`
      if (existsSync(exe)) return exe
    }
  } catch {
    /* no browsers dir */
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(p)) return p
  }
  return null
}

function findBuiltCss(): string | null {
  try {
    const file = readdirSync('dist/assets').find((f) => f.endsWith('.css'))
    return file ? readFileSync(`dist/assets/${file}`, 'utf8') : null
  } catch {
    return null
  }
}

const chromium = findChromium()
const css = findBuiltCss()
const canRun = !!chromium && !!css
const runIt = canRun ? it : it.skip

if (!canRun) {
  // eslint-disable-next-line no-console
  console.warn(
    `[WovenHero.visual] skipped — ${!chromium ? 'no Chromium binary' : ''}${
      !chromium && !css ? ' and ' : ''
    }${!css ? 'no dist CSS (run `npm run build` first)' : ''}`,
  )
}

describe('WovenHero folded labels are actually visible (real browser)', () => {
  runIt(
    'BUDGET and STOCK PROFIT eyebrows + figures are the painted element at their own centre',
    async (ctx) => {
      const { chromium: pw } = await import('playwright-core')

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
      const page = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<style>${css}</style><style>body{margin:0}#stage{width:390px;padding:16px}</style></head>
<body><div id="stage">${markup}</div></body></html>`

      // Only an assertion failure (a real regression) should fail CI. If the
      // browser can't even launch (e.g. a mismatched system binary on a runner),
      // skip rather than go red — the assertions below are the guard, not the
      // launcher.
      let browser
      try {
        browser = await pw.launch({ executablePath: chromium!, args: ['--no-sandbox'] })
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[WovenHero.visual] Chromium launch failed, skipping:', err)
        ctx.skip()
        return
      }
      try {
        const p = await browser.newPage({ viewport: { width: 390, height: 800 } })
        await p.setContent(page)

        // For each label expected to peek, assert the pixel at the centre of its
        // eyebrow (and its folded figure) belongs to THAT label — i.e. nothing is
        // painted over it. Returns the aria-label of whatever owns the pixel.
        const ownerAt = (text: string) =>
          p.evaluate((t) => {
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
    30_000,
  )
})
