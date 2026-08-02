import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Category } from '@/lib/db'

/**
 * Real-browser guard for the single-row category list at a 360px phone width.
 *
 * The list packs five things onto one line — icon · name · role badge · edit ·
 * delete. The name uses `truncate`, which fails SILENTLY: jsdom does no layout,
 * so a unit test can't see the name being clipped. We measured (PR #123, ใบ 4)
 * that the longest seeded name that also carries a badge —
 * `ค่าส่งที่เก็บจากลูกค้า` (a รายรับ + ของร้าน category, so it shows the ของร้าน
 * badge AND both action buttons — the tightest row there is) — is clipped by
 * ~9px at 360px. The owner accepted that 9px (≈ one glyph, rarely-visited screen;
 * a `title` attr gives the full name on hover/long-press).
 *
 * So this guard does NOT assert "never truncated" — it's truncated on purpose
 * today. It asserts the clip stays within a small budget, to catch the real
 * regression: someone adding another badge/button/chip to the row would push the
 * name off by tens of px with nothing else complaining. The threshold is 15px =
 * the measured 9px + ~6px headroom for cross-machine font-metric wobble; it is a
 * regression tripwire, not a pixel-perfect spec. Adding any element to the row
 * removes tens of px of name width and blows straight past it.
 *
 * Renders the REAL CategoriesManager (mocked data hooks) so the guard tracks the
 * component: change the row and this HTML changes with it. Browser resolution +
 * the skip-outside-CI / fail-inside-CI policy live in visual-harness.ts.
 */

const cat = (over: Partial<Category>): Category =>
  ({
    id: 'c',
    user_id: 'u',
    name: 'หมวด',
    kind: 'expense',
    is_stock_category: false,
    is_shop_category: false,
    is_system: false,
    system_key: null,
    icon: 'tag',
    color_index: 1,
    created_at: '',
    updated_at: '',
    ...over,
  }) as Category

// The worst-case seeded rows: the longest names that carry a badge.
const WORST_NAME = 'ค่าส่งที่เก็บจากลูกค้า' // รายรับ + ของร้าน → badge + edit + delete
const categories: Category[] = [
  cat({ id: 'i1', name: WORST_NAME, kind: 'income', is_shop_category: true, icon: 'cash', color_index: 2 }),
  cat({ id: 'e1', name: 'ค่าธรรมเนียมขาย', is_shop_category: true, icon: 'tag', color_index: 6 }),
  cat({ id: 'e2', name: 'รองเท้าเข้าร้าน', is_stock_category: true, icon: 'shoe', color_index: 1 }),
]

vi.mock('@/hooks/useLookups', () => ({ useCategories: () => ({ data: categories }) }))
vi.mock('@/hooks/useSettings', () => ({
  useUpsertCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetCategoryRole: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

// Import after mocks are registered.
const { CategoriesManager } = await import('@/components/CategoriesManager')
const { runVisualTest } = await import('@/components/visual-harness')

// Prompt is the design font (index.html loads it from Google Fonts). Load it here
// so the width baseline matches what a real user sees — a fallback font would have
// different Thai metrics and make the 9px measurement meaningless.
const PROMPT_HEAD =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500&display=swap">'

describe('CategoriesManager list row fits the name at 360px (real browser)', () => {
  it(
    `"${WORST_NAME}" is clipped by no more than the accepted budget`,
    async (ctx) => {
      const markup = renderToStaticMarkup(createElement(CategoriesManager, { onClose: () => {} }))

      await runVisualTest(
        ctx,
        // 360px viewport: the Overlay panel is position:fixed w-full → fills 360;
        // its content is px-4 (16px each side) → rows live in 328px, exactly the
        // real app. (#stage in the harness is ignored — fixed escapes it.)
        { name: 'categories-row-360', markup, headHtml: PROMPT_HEAD, viewport: { width: 360, height: 900 } },
        async (page) => {
          await page.evaluate(() => document.fonts.ready)
          const promptLoaded = await page.evaluate(() => document.fonts.check('16px "Prompt"'))
          if (!promptLoaded) {
            // A meaningful width baseline needs the real font. In CI that must be
            // provisioned (network to Google Fonts); locally a blocked network is
            // a dev-box quirk, so skip rather than cry wolf.
            const msg = 'Prompt webfont did not load — 360px width baseline needs it'
            if (process.env.CI) throw new Error(`[categories-row-360] ${msg}`)
            // eslint-disable-next-line no-console
            console.warn(`[categories-row-360] ${msg} (local, not CI) — skipping`)
            ctx.skip()
            return
          }

          const clip = await page.evaluate((name) => {
            const el = Array.from(document.querySelectorAll('span')).find(
              (s) => (s.textContent || '').trim() === name,
            )
            if (!el) return null
            return { scroll: el.scrollWidth, client: el.clientWidth }
          }, WORST_NAME)

          expect(clip, `name span for "${WORST_NAME}" must be in the DOM`).not.toBeNull()
          // scrollWidth > clientWidth ⇒ text is clipped by that many px.
          expect(
            clip!.scroll - clip!.client,
            `"${WORST_NAME}" clipped by ${clip!.scroll - clip!.client}px at 360px (budget 15)`,
          ).toBeLessThanOrEqual(15)
        },
      )
    },
    20_000,
  )
})
