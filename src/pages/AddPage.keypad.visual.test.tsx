// Real-browser layout guard for the /add keypad rework (§1 + the test brief's
// "visual guard เบราว์เซอร์จริง"). jsdom proves the collapse STATE machine
// (AddPage.keypad.test.tsx); it cannot prove what the user actually SEES, because
// it does no layout. This renders the REAL <AddPage> with the REAL compiled CSS
// in real Chromium, at a tight phone viewport with the keypad EXPANDED, and
// asserts the two things the old layout got wrong:
//
//   1. the ยอด (amount) stays on screen even after the form is scrolled to the
//      bottom — it is PINNED, not inside the scroll area. (Old bug: the amount
//      lived in the scroll zone, so on a short screen it scrolled clean off the
//      top while you kept typing.)
//   2. the บันทึก (save) button sits ABOVE the keypad, on screen, never under it
//      (§3 "ปุ่มบันทึกอยู่เหนือแป้น"). (Old bug: the dock stacked keypad → reason
//      → save, so save rendered BELOW the keypad grid.)
//
// It also checks the measured padding-bottom clears the dock, so no scroll
// content is trapped underneath the keypad (§2). Because SSR does not run the
// measuring effect, the guard replays exactly what that effect does (paddingBottom
// = dock.offsetHeight) before measuring — the same contract, verified against real
// geometry.
//
// PROVEN to catch the bug: run against the pre-rework AddPage.tsx it FAILS on both
// (1) (amount scrolled away) and (2) (save below the keypad). See the PR notes.
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

// Enough long Thai names + wallets + fast-labels that the scroll area overflows
// a phone screen — otherwise "scroll to the bottom" is a no-op and the amount
// never gets a chance to scroll away.
const CATS: Category[] = [
  cat('c1', 'อาหาร', 0),
  cat('c2', 'ช้อปปิ้ง', 1),
  cat('c3', 'เดินทาง', 2),
  cat('c4', 'บิล/ค่าบ้าน', 3),
  cat('c5', 'ค่าส่งที่เก็บจากลูกค้า', 4),
  cat('c6', 'สุขภาพ', 5),
  cat('c7', 'บันเทิง', 6),
  cat('c8', 'ของใช้ในบ้าน', 7),
]
const WALLETS: Wallet[] = [
  { id: 'w1', user_id: 'u1', name: 'เงินสด', type: 'cash', opening_balance: 0, created_at: '', updated_at: '' },
  { id: 'w2', user_id: 'u1', name: 'ธนาคาร', type: 'bank', opening_balance: 0, created_at: '', updated_at: '' },
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
const FAVS: Favorite[] = [fav('f1', 'กาแฟ 60', 60), fav('f2', 'ข้าว 50', 50), fav('f3', 'วิน 15', 15)]

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

describe('AddPage — keypad expanded, amount + save reachable (real browser)', () => {
  it(
    'pins the amount and keeps the save button above the keypad, on screen',
    async (ctx) => {
      // position:fixed;inset:0 gives the h-full root a real viewport-height box
      // to fill (the harness #stage has padding + no height of its own).
      const markup =
        '<div style="position:fixed;inset:0">' +
        renderToStaticMarkup(createElement(AddPage)) +
        '</div>'

      await runVisualTest(
        ctx,
        { name: 'AddPage.keypad', markup, viewport: { width: 360, height: 640 } },
        async (page) => {
          const r = await page.evaluate(() => {
            const vh = window.innerHeight
            const scroll = document.querySelector('.overflow-y-auto') as HTMLElement | null
            const keypad = document.querySelector('.grid-cols-3') as HTMLElement | null
            // The amount, selected by the ฿ glyph so it works on old AND new markup
            // (old: a <p>; new: a <button>). Take its sizeable ancestor.
            const baht = Array.from(document.querySelectorAll('span')).find(
              (s) => s.textContent === '฿',
            )
            const amount = (baht?.closest('button') ?? baht?.closest('p')) as HTMLElement | null
            // The primary save button, by its EXACT label — not the
            // "บันทึกเป็นป้ายด่วน" (save-as-fast-label) button, which also contains
            // "บันทึก" and comes first in the DOM.
            const saveEl = Array.from(document.querySelectorAll('button')).find((b) => {
              const t = (b.textContent ?? '').trim()
              return t === 'บันทึก' || t === 'กำลังบันทึก…'
            })
            if (!scroll || !keypad || !amount || !saveEl) {
              return { error: `missing: ${[!scroll && 'scroll', !keypad && 'keypad', !amount && 'amount', !saveEl && 'save'].filter(Boolean).join(',')}` }
            }

            // Replay the component's measuring effect (SSR didn't run it): reserve
            // the dock's real height so nothing hides beneath the pinned keypad.
            // The dock is the keypad's absolute-positioned ancestor (NOT the tiny
            // .absolute selvedge spans inside the fast-labels).
            const dock = keypad.closest('.absolute') as HTMLElement | null
            if (dock) scroll.style.paddingBottom = `${dock.offsetHeight}px`

            // Drive the form's scroll area all the way to the bottom — the moment
            // the old (in-scroll) amount would disappear.
            scroll.scrollTop = scroll.scrollHeight

            const a = amount.getBoundingClientRect()
            const k = keypad.getBoundingClientRect()
            const s = saveEl.getBoundingClientRect()
            const lastChild = scroll.lastElementChild as HTMLElement | null
            const lc = lastChild?.getBoundingClientRect()
            const dockTop = dock ? dock.getBoundingClientRect().top : k.top
            return {
              vh,
              amountVisible: a.top >= 0 && a.bottom <= vh && a.height > 0,
              saveVisible: s.top >= 0 && s.bottom <= vh && s.height > 0,
              saveAboveKeypad: Math.round(s.bottom) <= Math.round(k.top),
              keypadInView: k.top >= 0 && k.bottom <= vh + 1,
              lastChildClearsDock: lc ? Math.round(lc.bottom) <= Math.round(dockTop) + 1 : true,
            }
          })

          expect(r.error, r.error).toBeUndefined()
          // (1) the amount is PINNED — still visible after scrolling to the bottom
          expect(r.amountVisible, 'amount visible after scroll-to-bottom').toBe(true)
          // (2) save sits above the keypad and on screen (§3)
          expect(r.saveVisible, 'save button on screen').toBe(true)
          expect(r.saveAboveKeypad, 'save button is above the keypad grid').toBe(true)
          // keypad fully within the viewport, nothing clipped off the bottom
          expect(r.keypadInView, 'keypad fully in view').toBe(true)
          // (3) measured padding clears the dock — no content trapped underneath
          expect(r.lastChildClearsDock, 'last scroll item clears the dock').toBe(true)
        },
      )
    },
    60_000,
  )
})
