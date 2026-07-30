import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { WovenHero } from '@/components/WovenHero'
import { runVisualTest } from '@/components/visual-harness'

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
 * Browser resolution + skip/fail policy live in visual-harness.ts.
 */

describe('WovenHero folded labels are actually visible (real browser)', () => {
  it(
    'BUDGET and STOCK PROFIT eyebrows + figures are the painted element at their own centre',
    async (ctx) => {
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

      await runVisualTest(ctx, { name: 'WovenHero.visual', markup }, async (page) => {
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
      })
    },
    60_000,
  )
})
