import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SoldBand } from '@/pages/StockPage'
import { PhotoEditor } from '@/components/StockFields'
import { runVisualTest } from '@/components/visual-harness'
import { contrast, parseRgb, alphaOf, composite, type Rgb } from '@/components/visual-contrast'

/**
 * Dark-mode readability guard for the two `scrim` spots fixed in ใบ 9 (real
 * browser): the "ขายแล้ว" sold band over a product photo (StockPage.SoldBand)
 * and the photo-remove ✕ badge (StockFields.PhotoEditor).
 *
 * Both used to be `bg-ink` + white text/icon. `ink` flips near-WHITE in dark
 * mode, so the white content went white-on-near-white there — invisible, while
 * every DOM/`getByText` test stayed green (the same jsdom blind spot that hid
 * the toast and the "dark mode white page" bugs). The fix points both at the
 * theme-independent `scrim` token.
 *
 * So this renders the REAL components with the REAL compiled CSS in real
 * Chromium, in BOTH modes, composites each translucent ground over the page
 * surface, and asserts the WCAG contrast clears the readability bar — what the
 * user actually experiences. It fails on the old `bg-ink` markup in dark mode
 * (the sold band drops to ~2.2:1, the ✕ badge to ~1.2:1).
 *
 * WCAG maths → visual-contrast.ts (reused, not re-derived); skip/fail policy →
 * visual-harness.ts (throws, not skips, when process.env.CI is set).
 */

// 1×1 transparent PNG — a stand-in product thumbnail so PhotoEditor renders a tile.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

/** Composite a possibly-translucent computed colour over an opaque backdrop. */
function opaque(color: string, backdrop: Rgb): Rgb {
  return composite(parseRgb(color), alphaOf(color), backdrop)
}

describe('sold band + photo-remove badge are legible in both themes (real browser)', () => {
  it(
    'white label / ✕ clear the readability bar on the scrim ground, light AND dark',
    async (ctx) => {
      const markup =
        `<div id="band" class="relative bg-surface" style="width:150px;height:110px">` +
        renderToStaticMarkup(createElement(SoldBand)) +
        `</div>` +
        `<div id="badge" class="bg-surface" style="padding:12px">` +
        renderToStaticMarkup(
          createElement(PhotoEditor, {
            photos: [{ path: 'p1', preview: PIXEL }],
            onAdd: () => {},
            onRemove: () => {},
            uploading: false,
          }),
        ) +
        `</div>`

      await runVisualTest(ctx, { name: 'StockScrim.contrast', markup }, async (page) => {
        interface Raw {
          pageBg: string
          bandBg: string
          bandFg: string
          badgeBg: string
          badgeIcon: string
        }

        const sampleFor = (dark: boolean): Promise<Raw> =>
          page.evaluate((isDark) => {
            document.documentElement.classList.toggle('dark', isDark)
            const bandWrap = document.querySelector('#band')
            const band = bandWrap?.querySelector('span')
            const badge = document.querySelector('#badge [aria-label="ลบรูป"] span')
            const icon = badge?.querySelector('svg')
            if (!bandWrap || !band || !badge || !icon)
              throw new Error('sold band / remove badge not found')
            return {
              // The page ground both pieces of chrome float over (surface).
              pageBg: getComputedStyle(bandWrap as Element).backgroundColor,
              bandBg: getComputedStyle(band).backgroundColor,
              bandFg: getComputedStyle(band).color,
              badgeBg: getComputedStyle(badge).backgroundColor,
              // tabler icons stroke with currentColor → the icon colour IS `color`.
              badgeIcon: getComputedStyle(icon).color,
            }
          }, dark)

        const check = (r: Raw, mode: string) => {
          const page = parseRgb(r.pageBg)
          const bandBg = opaque(r.bandBg, page)
          const badgeBg = opaque(r.badgeBg, page)
          const bandC = contrast(parseRgb(r.bandFg), bandBg)
          const iconC = contrast(opaque(r.badgeIcon, badgeBg), badgeBg)
          // Sold label is normal text → WCAG AA 4.5:1. This is the assertion the
          // old bg-ink markup fails in dark mode (~2.2:1).
          expect(bandC, `${mode} sold-band text contrast ${bandC.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
          // The ✕ is a functional graphical glyph → WCAG 3:1. Old bg-ink badge
          // in dark mode was ~1.2:1.
          expect(iconC, `${mode} remove-✕ contrast ${iconC.toFixed(2)}`).toBeGreaterThanOrEqual(3)
        }

        check(await sampleFor(false), 'light')
        check(await sampleFor(true), 'dark')
      })
    },
    60_000,
  )
})
