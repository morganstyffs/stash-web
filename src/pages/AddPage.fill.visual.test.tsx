// Full-screen (/add) half of the shell-fill guard (ใบ 10). The bottom gap is most
// VISIBLE on /add because the page is white and any shortfall exposes the beige
// body/surface beneath it. /add is a full-screen flow mounted straight in #root
// (not under AppLayout), and its root uses `h-full` (height:100%) — so it relies on
// #root being a viewport-tall box. This renders the REAL <AddPage> with the REAL
// compiled CSS in real Chromium, mounted the way the router mounts it (directly in
// #root, no fixed wrapper), and asserts the white page reaches the viewport bottom.
//
// Discriminator: `extraCss` neutralises the html/body definite height to emulate the
// mobile condition where the percentage basis is not the visible viewport. On the
// pre-fix `#root { height: 100% }` the page's `h-full` then collapses to content and
// leaves a large bottom gap; on the fix `#root { height: 100dvh }` it fills. PROVEN
// to fail pre-fix (gap ≈ 240–680px); see the PR notes.
//
// The dock geometry (keypad / save / ResizeObserver padding) is NOT this guard's
// concern — that stays owned by AddPage.keypad.visual.test.tsx, which must remain
// green. This only measures the page's background fill.
//
// skip/fail policy (throws in CI, skips on a dev box with no Chromium) →
// visual-harness.ts.
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Category, Favorite, Wallet } from '@/lib/db'
import { runVisualTest } from '@/components/visual-harness'

vi.mock('react-router-dom', () => ({
  useNavigate: () => () => {},
  useLocation: () => ({ state: null }),
}))

const cat = (id: string, name: string, sort: number): Category => ({
  id,
  user_id: 'u1',
  name,
  kind: 'expense',
  icon: 'tag',
  color_index: 0,
  sort_order: sort,
  is_shop_category: false,
  is_stock_category: false,
  is_system: false,
  system_key: null,
  created_at: '',
  updated_at: '',
})

const CATS: Category[] = [
  cat('c1', 'อาหาร', 0),
  cat('c2', 'ช้อปปิ้ง', 1),
  cat('c3', 'เดินทาง', 2),
]
const WALLETS: Wallet[] = [
  { id: 'w1', user_id: 'u1', name: 'เงินสด', type: 'cash', opening_balance: 0, created_at: '', updated_at: '' },
]
const fav = (id: string, label: string, amount: number): Favorite => ({
  id,
  user_id: 'u1',
  label,
  type: 'expense',
  amount,
  category_id: 'c1',
  wallet_id: 'w1',
  note: null,
  created_at: '',
  updated_at: '',
})
const FAVS: Favorite[] = [fav('f1', 'กาแฟ 60', 60)]

vi.mock('@/hooks/useLookups', () => ({
  useCategories: () => ({ data: CATS }),
  useFavorites: () => ({ data: FAVS }),
  useUpsertFavorite: () => ({ mutateAsync: async () => {}, isPending: false }),
}))
vi.mock('@/hooks/useAddTransaction', () => ({
  useAddTransaction: () => ({ mutateAsync: async () => ({ id: 'r1' }), isPending: false, error: null }),
}))
vi.mock('@/hooks/useTransactions', () => ({ useDeleteTransaction: () => ({ mutateAsync: async () => {} }) }))
vi.mock('@/hooks/useEntryHints', () => ({ useEntryHints: () => ({ data: [] }) }))
vi.mock('@/hooks/useSettings', () => ({ useWallets: () => ({ data: WALLETS }) }))
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success() {}, error() {}, show: () => 0, dismiss() {} }),
}))
vi.mock('@/components/CategoriesManager', () => ({ CategoriesManager: () => null }))
vi.mock('@/components/FavoritesManager', () => ({ FavoritesManager: () => null }))

import { AddPage } from '@/pages/AddPage'

const NEUTRALISE_ANCESTORS = 'html,body{height:auto}'
const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 390, height: 740 },
]

describe('/add full-screen page fills the mobile viewport — no bottom gap (real browser)', () => {
  it(
    'the white page reaches the viewport bottom at phone sizes',
    async (ctx) => {
      // Mounted directly in #root (no fixed wrapper) — exactly how the router
      // mounts the full-screen /add flow, so the production #root height governs.
      const markup = renderToStaticMarkup(createElement(AddPage))

      for (const viewport of VIEWPORTS) {
        await runVisualTest(
          ctx,
          { name: `AddPage.fill.${viewport.width}`, markup, fullBleed: true, extraCss: NEUTRALISE_ANCESTORS, viewport },
          async (page) => {
            const r = await page.evaluate(() => {
              const vh = window.innerHeight
              const shell = document.querySelector('#root > div') as HTMLElement | null
              if (!shell) return { error: 'page root not found' }
              const rect = shell.getBoundingClientRect()
              const cs = getComputedStyle(shell)
              return {
                vh,
                bottom: rect.bottom,
                bgAlpha: Number(cs.backgroundColor.match(/[\d.]+\)$/)?.[0]?.slice(0, -1) ?? '1'),
              }
            })
            expect(r.error, r.error).toBeUndefined()
            expect(r.bgAlpha, 'page background must be opaque').toBeGreaterThan(0.99)
            const gap = r.vh! - r.bottom!
            expect(
              gap,
              `/add bottom gap is ${gap.toFixed(1)}px at ${viewport.width}×${viewport.height} (vh=${r.vh}, page bottom=${r.bottom})`,
            ).toBeLessThanOrEqual(1)
          },
        )
      }
    },
    60_000,
  )
})
