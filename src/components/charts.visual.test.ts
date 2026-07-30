import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Donut } from '@/components/charts'
import { runVisualTest } from '@/components/visual-harness'

/**
 * Visual regression guard for the donut centre total.
 *
 * A number overflowing the ring is a layout fact jsdom can't see (it does no
 * layout), so a unit test that only checks what donutCenterFontSize *returns*
 * stays green while the real thing spills over the ring. This renders the real
 * Donut with the real compiled CSS and the real Prompt font in real Chromium and
 * asserts, for every value in the spec's table, that all four CORNERS of the
 * total's box sit inside the ring's inner hole — the same corner criterion the
 * sizing math uses (not merely "width < diameter"). The inner radius is read from
 * the ring <circle> in the DOM, so this tracks the geometry automatically.
 *
 * Runs on old geometry → red (฿1,234,567 overflowed at the 11px floor); on the
 * widened hole → green. Browser resolution + skip/fail policy: visual-harness.ts.
 */

// Everyday value, 6-figure, 7-figure, zero — plus the hide-balance mask, which
// must fit too. Slice colour is a colour slot (colorIndex), resolved to a
// palette var by the component — this test only checks the centre total's fit.
const CASES: { id: string; total: number; hideBalance?: boolean }[] = [
  { id: 'zero', total: 0 },
  { id: 'everyday', total: 48_052 },
  { id: 'sixfig', total: 999_999 },
  { id: 'sevenfig', total: 1_234_567 },
  { id: 'masked', total: 48_052, hideBalance: true },
]

const PROMPT_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500&display=swap" rel="stylesheet">'

describe('Donut centre total fits inside the ring (real browser)', () => {
  it(
    'every corner of the total box is within the inner hole, for each spec value',
    async (ctx) => {
      const markup = CASES.map((c) => {
        const inner = renderToStaticMarkup(
          createElement(Donut, {
            slices: [{ categoryId: 'a', name: 'x', colorIndex: 1, total: c.total }],
            hideBalance: c.hideBalance,
          }),
        )
        // flex wrapper mirrors HomePage (Donut is a shrink-0 flex child), so the
        // ring's div sizes to the svg and the centred text lines up with the hole.
        return `<div id="${c.id}" style="display:flex">${inner}</div>`
      }).join('')

      await runVisualTest(
        ctx,
        { name: 'charts.visual', markup, headHtml: PROMPT_LINK, viewport: { width: 390, height: 900 } },
        async (page) => {
          await page.evaluate(() => document.fonts.ready)
          // give the linked Prompt font a moment to apply before measuring width
          await page.waitForTimeout(800)

          const results = await page.evaluate((ids: string[]) =>
            ids.map((id) => {
              const root = document.getElementById(id)!
              const svg = root.querySelector('svg')!
              const ring = svg.querySelector('circle')! // first circle = background ring
              const svgR = svg.getBoundingClientRect()
              const scale = svgR.width / 80 // viewBox is 80
              const rAttr = parseFloat(ring.getAttribute('r')!)
              const sw = parseFloat(ring.getAttribute('stroke-width')!)
              const innerR = (rAttr - sw / 2) * scale
              const cx = svgR.left + svgR.width / 2
              const cy = svgR.top + svgR.height / 2
              const box = root.querySelector('span')!.getBoundingClientRect()
              const corners: [number, number][] = [
                [box.left, box.top],
                [box.right, box.top],
                [box.left, box.bottom],
                [box.right, box.bottom],
              ]
              const maxCorner = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy)))
              return {
                id,
                text: root.querySelector('span')!.textContent,
                innerR: +innerR.toFixed(2),
                maxCorner: +maxCorner.toFixed(2),
                fits: maxCorner <= innerR,
              }
            }),
            CASES.map((c) => c.id),
          )

          for (const r of results) {
            expect(
              r.fits,
              `${r.id} "${r.text}": box corner ${r.maxCorner}px exceeds inner radius ${r.innerR}px`,
            ).toBe(true)
          }
        },
      )
    },
    60_000,
  )
})
