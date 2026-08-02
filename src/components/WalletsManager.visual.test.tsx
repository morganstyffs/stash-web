import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Wallet, WalletBalance } from '@/lib/db'

/**
 * Real-browser guard for the wallet row at a 360px phone width.
 *
 * ใบ 7 adds a balance to each wallet row. The balance figure is deliberately on
 * the row's SUBLINE and marked `shrink-0`, so the money itself can never silently
 * clip — only the wallet NAME (top line, `truncate`) or the type label can. This
 * guard watches the name: today the top line is icon · name · edit · delete (the
 * balance is NOT on it), so a long name has room. The regression it exists to
 * catch is the tempting refactor that moves the balance (or a badge) onto the top
 * line — that steals ~90px from the name column and clips a long name by tens of
 * px, with nothing else complaining (jsdom does no layout, so a unit test can't
 * see it). Proven to fail against exactly that change (balance moved to the top
 * line) during development.
 *
 * Budget is the measured today-clip + headroom for cross-machine font wobble; it
 * is a regression tripwire, not a pixel spec. Browser resolution + the
 * skip-outside-CI / fail-inside-CI policy live in visual-harness.ts.
 */

// A realistically-long custom wallet name: fits today's roomy top line, but not a
// column narrowed by a balance figure.
const WORST_NAME = 'บัญชีเงินเก็บสำรองฉุกเฉิน'

const wallet = (over: Partial<Wallet>): Wallet =>
  ({
    id: 'w1',
    user_id: 'u',
    name: WORST_NAME,
    type: 'promptpay', // longest type label (พร้อมเพย์)
    opening_balance: 0,
    created_at: '',
    updated_at: '',
    ...over,
  }) as Wallet

const bal = (over: Partial<WalletBalance>): WalletBalance => ({
  wallet_id: 'w1',
  opening_balance: 0,
  income_total: 0,
  expense_total: 0,
  transfer_in: 0,
  transfer_out: 0,
  balance: 9_999_999, // widest realistic figure — the most name width it can steal
  ...over,
})

vi.mock('@/hooks/useSettings', () => ({
  useWallets: () => ({ data: [wallet({})] }),
  useWalletBalances: () => ({ data: [bal({})], isError: false, error: null }),
  useWalletTransfers: () => ({ data: { rows: [], capped: false }, isError: false, error: null }),
  useUpsertWallet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWallet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteWalletTransfer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateWalletTransfer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  WALLET_TRANSFER_CAP: 100,
}))
vi.mock('@/hooks/useHideBalance', () => ({
  useHideBalance: () => ({ hideBalance: false, toggleHideBalance: () => {} }),
}))
vi.mock('@/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

// Import after mocks are registered.
const { WalletsManager } = await import('@/components/WalletsManager')
const { runVisualTest } = await import('@/components/visual-harness')

const PROMPT_HEAD =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500&display=swap">'

describe('WalletsManager row fits the name at 360px (real browser)', () => {
  it(
    `"${WORST_NAME}" is clipped by no more than the accepted budget`,
    async (ctx) => {
      const markup = renderToStaticMarkup(createElement(WalletsManager, { onClose: () => {} }))

      await runVisualTest(
        ctx,
        { name: 'wallets-row-360', markup, headHtml: PROMPT_HEAD, viewport: { width: 360, height: 900 } },
        async (page) => {
          await page.evaluate(() => document.fonts.ready)
          const promptLoaded = await page.evaluate(() => document.fonts.check('16px "Prompt"'))
          if (!promptLoaded) {
            const msg = 'Prompt webfont did not load — 360px width baseline needs it'
            if (process.env.CI) throw new Error(`[wallets-row-360] ${msg}`)
            // eslint-disable-next-line no-console
            console.warn(`[wallets-row-360] ${msg} (local, not CI) — skipping`)
            ctx.skip()
            return
          }

          const clip = await page.evaluate((name) => {
            const el = Array.from(document.querySelectorAll('p')).find(
              (p) => (p.textContent || '').trim() === name,
            )
            if (!el) return null
            return { scroll: el.scrollWidth, client: el.clientWidth }
          }, WORST_NAME)

          expect(clip, `name <p> for "${WORST_NAME}" must be in the DOM`).not.toBeNull()
          expect(
            clip!.scroll - clip!.client,
            `"${WORST_NAME}" clipped by ${clip!.scroll - clip!.client}px at 360px (budget 8)`,
          ).toBeLessThanOrEqual(8)
        },
      )
    },
    20_000,
  )
})
