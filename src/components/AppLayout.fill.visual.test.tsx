import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { ToastProvider } from '@/components/Toast'
import { AppLayout } from '@/components/AppLayout'
import { runVisualTest } from '@/components/visual-harness'

/**
 * Shell-fill guard for the mobile bottom gap (ใบ 10). The reported bug: on a phone
 * the shell background stops short of the screen bottom, leaving an empty strip of
 * the beige body/surface below the content ("แถบพื้นเบจว่างด้านล่าง").
 *
 * Root cause: the app anchored its fill to `html, body, #root { height: 100% }`. A
 * percentage height resolves against the ancestor's height, and on a mobile browser
 * the html/body percentage basis is the *large* (toolbar-retracted) viewport, which
 * does NOT track the address bar — so the shell's `min-h-full` could resolve to a
 * height that is not the visible viewport, and a short page fell short of the
 * screen. The fix pins `#root` to the dynamic viewport (`height: 100dvh`), a length
 * that always equals what is on screen, independent of the fragile ancestor chain.
 *
 * jsdom does no layout and headless Chromium has no address bar, so neither can
 * reproduce the toolbar mismatch directly. This guard reproduces the *property* the
 * fix restores: the shell must fill the visible viewport (`window.innerHeight`)
 * even when the ancestor height chain hands down no viewport-height — exactly the
 * mobile condition. `extraCss` neutralises the html/body definite height; a
 * `%`-anchored shell then collapses (bottom gap » 0), while a `dvh`-anchored #root
 * still fills it (gap ≈ 0). PROVEN to fail on the pre-fix `#root { height: 100% }`
 * (gap ≈ 240–680px at these viewports); see the PR notes.
 *
 * skip/fail policy (throws in CI, skips on a dev box with no Chromium) →
 * visual-harness.ts.
 */

// html/body carry no definite height → the only thing that can hand #root a
// viewport-tall box is #root's own rule. This is the mobile reality: the ancestor
// percentage basis is not the visible viewport.
const NEUTRALISE_ANCESTORS = 'html,body{height:auto}'
const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 740 },
]

describe('app shell fills the mobile viewport — no bottom gap (real browser)', () => {
  it(
    'the surface shell reaches the viewport bottom at phone sizes',
    async (ctx) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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
                    // A deliberately SHORT page — the case that used to fall short
                    // of the screen. If the shell only fills to content height the
                    // gap is large; if it fills the viewport the gap is ~0.
                    children: createElement(Route, {
                      index: true,
                      element: createElement('p', { className: 'text-ink p-5' }, 'สั้น'),
                    }),
                  }),
                ),
              ),
            ),
          ),
        ),
      )

      for (const viewport of VIEWPORTS) {
        await runVisualTest(
          ctx,
          { name: `AppLayout.fill.${viewport.width}`, markup, fullBleed: true, extraCss: NEUTRALISE_ANCESTORS, viewport },
          async (page) => {
            const r = await page.evaluate(() => {
              const vh = window.innerHeight
              // The shell = the outermost AppLayout div (paints bg-surface).
              const shell = document.querySelector('#root > div') as HTMLElement | null
              if (!shell) return { error: 'shell not found' }
              const rect = shell.getBoundingClientRect()
              const cs = getComputedStyle(shell)
              return {
                vh,
                bottom: rect.bottom,
                bgAlpha: Number(cs.backgroundColor.match(/[\d.]+\)$/)?.[0]?.slice(0, -1) ?? '1'),
              }
            })
            expect(r.error, r.error).toBeUndefined()
            // The painted shell must be a real opaque fill, not transparent.
            expect(r.bgAlpha, 'shell background must be opaque').toBeGreaterThan(0.99)
            const gap = r.vh! - r.bottom!
            // Bottom gap must be ~0 (sub-pixel rounding tolerance). On the pre-fix
            // height:100% this is hundreds of px at these viewports.
            expect(
              gap,
              `shell bottom gap is ${gap.toFixed(1)}px at ${viewport.width}×${viewport.height} (vh=${r.vh}, shell bottom=${r.bottom})`,
            ).toBeLessThanOrEqual(1)
          },
        )
      }
    },
    60_000,
  )
})
