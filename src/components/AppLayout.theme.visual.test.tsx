import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { ToastProvider } from '@/components/Toast'
import { AppLayout } from '@/components/AppLayout'
import { runVisualTest } from '@/components/visual-harness'
import { luminance, contrast, parseRgb } from '@/components/visual-contrast'

/**
 * Dark-mode legibility guard for the app page background (real browser).
 *
 * The bug this catches: switching to dark mode left the whole page white while
 * the token-driven text (text-ink / text-muted) turned light — unreadable app-
 * wide. `body{background:theme('colors.surface')}` compiles correctly and tracks
 * --color-surface, but the AppLayout shell painted `bg-white` on top of it, a
 * hardcoded white that ignores `html.dark`. Every existing test was green: they
 * check the DOM and the money math, never a *rendered colour*. So this renders
 * the real AppLayout with the real compiled CSS in real Chromium, in BOTH modes,
 * and measures the computed page background + primary text colour.
 *
 * The contrast assertion is the load-bearing one — it measures what the user
 * actually experiences (can I read this?), not merely "did the colour change".
 *
 * WCAG colour maths live in visual-contrast.ts; browser resolution + skip/fail
 * policy live in visual-harness.ts.
 */

interface Sample {
  bg: string
  fg: string
  bgAlpha: number
}

describe('app page background is legible in dark mode (real browser)', () => {
  it(
    'dark mode paints a dark page background and body text clears the readability bar in both modes',
    async (ctx) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      // Real AppLayout shell (the element that paints the page background) around a
      // route whose text uses the same token utilities the real screens do.
      const markup = renderToStaticMarkup(
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            AuthProvider,
            null,
            createElement(
              ToastProvider,
              null,
              createElement(
                MemoryRouter,
                null,
                createElement(
                  Routes,
                  null,
                  createElement(Route, {
                    element: createElement(AppLayout),
                    children: createElement(Route, {
                      index: true,
                      element: createElement(
                        'p',
                        { className: 'text-ink', 'data-testid': 'body-text' },
                        'ยอดคงเหลือเดือนนี้',
                      ),
                    }),
                  }),
                ),
              ),
            ),
          ),
        ),
      )

      await runVisualTest(ctx, { name: 'AppLayout.theme', markup }, async (page) => {
        const sampleFor = (dark: boolean): Promise<Sample> =>
          page.evaluate((isDark) => {
            document.documentElement.classList.toggle('dark', isDark)
            // Page background = the outermost AppLayout div (the shell that paints
            // the surface). Primary text = the token-driven body copy inside it.
            const shell = document.querySelector('#stage > div')
            const text = document.querySelector('[data-testid="body-text"]')
            if (!shell || !text) throw new Error('shell or body text not found')
            const cs = getComputedStyle(shell)
            return {
              bg: cs.backgroundColor,
              bgAlpha: Number(cs.backgroundColor.match(/[\d.]+\)$/)?.[0]?.slice(0, -1) ?? '1'),
              fg: getComputedStyle(text).color,
            }
          }, dark)

        const light = await sampleFor(false)
        const dark = await sampleFor(true)

        // The page background must be a real, opaque fill — not left transparent
        // (which would just be the browser's white default showing through).
        expect(dark.bgAlpha, 'dark page background must be opaque').toBeGreaterThan(0.99)

        // Dark mode must actually be dark: the reported bug was a white page.
        const darkBgLum = luminance(...parseRgb(dark.bg))
        expect(darkBgLum, `dark page background stayed light: ${dark.bg}`).toBeLessThan(0.15)

        // The load-bearing checks: body text must be readable against the page in
        // BOTH modes (WCAG AA for normal text = 4.5:1).
        const lightContrast = contrast(parseRgb(light.fg), parseRgb(light.bg))
        const darkContrast = contrast(parseRgb(dark.fg), parseRgb(dark.bg))
        expect(
          lightContrast,
          `light mode contrast ${lightContrast.toFixed(2)} (${light.fg} on ${light.bg})`,
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          darkContrast,
          `dark mode contrast ${darkContrast.toFixed(2)} (${dark.fg} on ${dark.bg})`,
        ).toBeGreaterThanOrEqual(4.5)
      })
    },
    60_000,
  )
})
