import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ToastPill } from '@/components/Toast'
import { runVisualTest } from '@/components/visual-harness'
import { contrast, parseRgb, alphaOf, composite, type Rgb } from '@/components/visual-contrast'

/**
 * Readability guard for the toast/snackbar capsule (real browser).
 *
 * The bug this catches had two compounding causes behind one invisible
 * "บันทึกแล้ว" message. The capsule was `bg-ink/92` + `text-white`. First, a bare
 * `/92` is not a valid opacity step in this Tailwind build, so NO background rule
 * compiled and the pill was transparent — white text on the light page read as a
 * blank white capsule. Second, `ink` is a theme-flipping token (near-black on
 * light, near-WHITE on dark), so even once a background applies it would hide the
 * white text in dark mode instead. Every DOM/`getByText` test stayed green (the
 * text is in the DOM) — the jsdom blind spot that bit "dark mode white page" and
 * the woven-label bug before it.
 *
 * So this renders the REAL <ToastPill> with the REAL compiled CSS in real
 * Chromium, in BOTH modes, and measures the *computed* text colour against the
 * capsule's *composited* background (the pill is ~92% opaque over the page — a
 * transparent pill composites to the page colour, which is exactly what fails),
 * then asserts the WCAG contrast clears the readability bar — what the user
 * actually experiences, not "is the class present". The fix is the always-dark
 * `toast` token at a valid /[0.92]; this fails if the capsule loses its dark,
 * opaque ground in either theme.
 *
 * WCAG maths → visual-contrast.ts; skip/fail policy → visual-harness.ts.
 */

/** Raw computed colour strings read out of the page. */
interface Raw {
  pillBg: string
  pageBg: string
  fg: string
  iconColor: string
}

interface Sample {
  /** computed message text colour */
  fg: Rgb
  /** capsule background composited over the page (opaque) */
  bg: Rgb
  /** computed success-icon colour, composited over the same background */
  icon: Rgb
}

describe('toast capsule text is legible in both themes (real browser)', () => {
  it(
    'success-toast message and icon clear the readability bar on light AND dark',
    async (ctx) => {
      const markup = renderToStaticMarkup(
        createElement(ToastPill, {
          item: { id: 1, kind: 'success', message: 'บันทึกแล้ว' },
        }),
      )

      await runVisualTest(ctx, { name: 'Toast.contrast', markup }, async (page) => {
        const sampleFor = (dark: boolean): Promise<Raw> =>
          page.evaluate((isDark) => {
            document.documentElement.classList.toggle('dark', isDark)
            const pill = document.querySelector('[role="status"]')
            const text = pill?.querySelector('span')
            const svg = pill?.querySelector('svg')
            if (!pill || !text || !svg) throw new Error('toast pill / text / icon not found')
            return {
              pillBg: getComputedStyle(pill).backgroundColor,
              // The capsule floats over the page background (surface). Report it so
              // the test can composite the 92%-opaque pill over it.
              pageBg: getComputedStyle(document.body).backgroundColor,
              fg: getComputedStyle(text).color,
              // tabler icons stroke with currentColor, so the icon colour IS `color`.
              iconColor: getComputedStyle(svg).color,
            }
          }, dark)

        const build = (r: Raw): Sample => {
          const page = parseRgb(r.pageBg)
          const bg = composite(parseRgb(r.pillBg), alphaOf(r.pillBg), page)
          return {
            fg: parseRgb(r.fg),
            bg,
            icon: composite(parseRgb(r.iconColor), alphaOf(r.iconColor), bg),
          }
        }

        const light = build(await sampleFor(false))
        const dark = build(await sampleFor(true))

        // Load-bearing: the message must be readable on the capsule in BOTH modes
        // (WCAG AA for normal text = 4.5:1). This is the assertion the reported bug
        // would have failed — white-on-white is ~1:1.
        const lightC = contrast(light.fg, light.bg)
        const darkC = contrast(dark.fg, dark.bg)
        expect(lightC, `light toast text contrast ${lightC.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
        expect(darkC, `dark toast text contrast ${darkC.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)

        // The success check-mark is a meaningful graphical object → WCAG 3:1. On a
        // white capsule the locked income-soft green would have been washed out too.
        const lightIcon = contrast(light.icon, light.bg)
        const darkIcon = contrast(dark.icon, dark.bg)
        expect(lightIcon, `light toast icon contrast ${lightIcon.toFixed(2)}`).toBeGreaterThanOrEqual(3)
        expect(darkIcon, `dark toast icon contrast ${darkIcon.toFixed(2)}`).toBeGreaterThanOrEqual(3)
      })
    },
    60_000,
  )
})
