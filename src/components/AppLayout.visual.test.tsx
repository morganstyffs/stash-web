import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { BottomNav } from '@/components/AppLayout'
import { runVisualTest } from '@/components/visual-harness'

/**
 * Touch-target + centring guard for the mobile bottom nav at 390px. The bar is now
 * 4 tabs around a centre FAB (5 slots). The PR brief is explicit: measure the real
 * slots at 390px and fail loudly rather than let icons shrink to fit, AND prove the
 * FAB is on the TRUE centre by measurement, not by eye — the old 6-slot bar put the
 * FAB 4-of-6 and it read off-centre. jsdom does no layout, so this renders the real
 * component with the real compiled CSS in real Chromium and measures the boxes.
 *
 * 5 items: 4 NavLinks (<a>) + the centre add button. Each tab is flex-1 (~1/5 of
 * the bar) with a ≥44px touch target; the assertion is the 44px WCAG/HIG minimum,
 * so a padding change that squeezes them — or a 6th slot creeping back — trips here.
 */
describe('bottom nav touch targets at 390px (real browser)', () => {
  it(
    'every one of the 5 slots is at least 44×44px',
    async (ctx) => {
      const markup = renderToStaticMarkup(
        createElement(MemoryRouter, null, createElement(BottomNav, { hasBadge: true })),
      )
      await runVisualTest(ctx, { name: 'bottom-nav-44', markup }, async (page) => {
        const boxes = await page.$$eval(
          '#stage a, #stage button[aria-label="เพิ่มรายการ"]',
          (els) =>
            els.map((el) => {
              const r = el.getBoundingClientRect()
              return { label: el.getAttribute('aria-label'), w: r.width, h: r.height }
            }),
        )
        // exactly the 5 slots (4 tab links + add), no more, no less.
        expect(boxes).toHaveLength(5)
        for (const b of boxes) {
          expect.soft(b.w, `${b.label} width`).toBeGreaterThanOrEqual(44)
          expect.soft(b.h, `${b.label} height`).toBeGreaterThanOrEqual(44)
        }
      })
    },
    20_000,
  )

  it(
    'the "ถาม AI" pill (consent on) is NOT a bar slot and does not shift the FAB centre',
    async (ctx) => {
      // PR-5 turns the disabled placeholder pill into a real, consent-gated button.
      // It floats above the bar (absolute), so it must neither become a 6th slot nor
      // move the FAB off centre. Render the ENABLED state and re-assert both guards.
      const markup = renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(BottomNav, { hasBadge: true, aiEnabled: true }),
        ),
      )
      await runVisualTest(ctx, { name: 'bottom-nav-ai-enabled', markup }, async (page) => {
        const slots = await page.$$eval(
          '#stage a, #stage button[aria-label="เพิ่มรายการ"]',
          (els) => els.length,
        )
        expect(slots, 'still exactly 5 bar slots with the pill enabled').toBe(5)

        const geom = await page.evaluate(() => {
          const bar = document.querySelector('[data-testid="bottom-nav-bar"]')
          const fab = document.querySelector('button[aria-label="เพิ่มรายการ"]')
          if (!bar || !fab) return null
          const b = bar.getBoundingClientRect()
          const f = fab.getBoundingClientRect()
          return { barCentre: b.left + b.width / 2, fabCentre: f.left + f.width / 2 }
        })
        expect(geom, 'bar + FAB must both be in the DOM').not.toBeNull()
        const offset = Math.abs(geom!.fabCentre - geom!.barCentre)
        expect(offset, `FAB is ${offset.toFixed(1)}px off the bar centre`).toBeLessThanOrEqual(1)

        // and the pill itself is present and reachable (the consent-on state)
        const pill = await page.$$eval('#stage button[aria-label="ถาม AI"]', (els) => els.length)
        expect(pill, 'the ถาม AI pill is rendered when enabled').toBe(1)
      })
    },
    20_000,
  )

  it(
    'the add FAB sits on the true horizontal centre of the bar',
    async (ctx) => {
      const markup = renderToStaticMarkup(
        createElement(MemoryRouter, null, createElement(BottomNav, { hasBadge: true })),
      )
      await runVisualTest(ctx, { name: 'bottom-nav-fab-centre', markup }, async (page) => {
        const geom = await page.evaluate(() => {
          const bar = document.querySelector('[data-testid="bottom-nav-bar"]')
          const fab = document.querySelector('button[aria-label="เพิ่มรายการ"]')
          if (!bar || !fab) return null
          const b = bar.getBoundingClientRect()
          const f = fab.getBoundingClientRect()
          return {
            barCentre: b.left + b.width / 2,
            fabCentre: f.left + f.width / 2,
          }
        })
        expect(geom, 'bar + FAB must both be in the DOM').not.toBeNull()
        // The FAB's horizontal centre must coincide with the bar's — within a
        // sub-pixel tolerance for rounding. On the old 6-slot bar the FAB was the
        // 4th of 6 and this gap was tens of px, so this assertion fails there.
        const offset = Math.abs(geom!.fabCentre - geom!.barCentre)
        expect(offset, `FAB is ${offset.toFixed(1)}px off the bar centre`).toBeLessThanOrEqual(1)
      })
    },
    20_000,
  )
})
