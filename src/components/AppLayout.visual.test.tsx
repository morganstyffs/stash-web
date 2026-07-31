import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { BottomNav } from '@/components/AppLayout'
import { runVisualTest } from '@/components/visual-harness'

/**
 * Touch-target guard for the mobile bottom nav at 390px. Adding ยอดค้าง took the
 * bar from 5 slots to 6, and the PR brief is explicit: measure the real slot at
 * 390px, and if any is under 44px, fail loudly rather than let icons shrink to
 * fit. jsdom doesn't do layout, so this renders the real component with the real
 * compiled CSS in real Chromium and measures every tappable item's box.
 *
 * 6 items: 5 NavLinks (<a>) + the centre add button. Each is h-11 w-11 = 44px;
 * the assertion is the 44px WCAG/HIG minimum, so a future 7th slot or a padding
 * change that squeezes them trips here.
 */
describe('bottom nav touch targets at 390px (real browser)', () => {
  it(
    'every one of the 6 slots is at least 44×44px',
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
        // exactly the 6 destinations (5 links + add), no more, no less.
        expect(boxes).toHaveLength(6)
        for (const b of boxes) {
          expect.soft(b.w, `${b.label} width`).toBeGreaterThanOrEqual(44)
          expect.soft(b.h, `${b.label} height`).toBeGreaterThanOrEqual(44)
        }
      })
    },
    20_000,
  )
})
