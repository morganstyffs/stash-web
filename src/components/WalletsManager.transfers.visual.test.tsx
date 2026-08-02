import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Wallet, WalletBalance, WalletTransfer } from '@/lib/db'

/**
 * Real-browser guard for the transfer-history row at 360px.
 *
 * ใบ 8 adds "จาก → ไป" history rows. The design keeps the amount and date on the
 * SUBLINE so the money is never crammed onto the names line, but two wallet names
 * plus the arrow are still ~2× a single name, so the "จาก → ไป" line is the one
 * that can silently truncate. This guard watches it: today it clips within a
 * small accepted budget; the regression it catches is putting the amount (or any
 * extra element) back onto the names line — that steals tens of px and clips the
 * names hard, with nothing else complaining (jsdom does no layout). Proven to
 * fail against exactly that change during development.
 */

const FROM_NAME = 'บัญชีเงินเก็บสำรองฉุกเฉิน'
const TO_NAME = 'กระเป๋าเงินสดสำรอง'
const LINE_TEXT = `${FROM_NAME} → ${TO_NAME}`

const wallet = (id: string, name: string): Wallet =>
  ({ id, user_id: 'u', name, type: 'cash', opening_balance: 0, created_at: '', updated_at: '' }) as Wallet

const bal = (wallet_id: string): WalletBalance => ({
  wallet_id,
  opening_balance: 0,
  income_total: 0,
  expense_total: 0,
  transfer_in: 0,
  transfer_out: 0,
  balance: 0,
})

const transfer: WalletTransfer = {
  id: 't1',
  user_id: 'u',
  from_wallet_id: 'w1',
  to_wallet_id: 'w2',
  amount: 9_999_999,
  transfer_date: '2026-08-02',
  note: null,
  created_at: '',
} as WalletTransfer

vi.mock('@/hooks/useSettings', () => ({
  useWallets: () => ({ data: [wallet('w1', FROM_NAME), wallet('w2', TO_NAME)] }),
  useWalletBalances: () => ({ data: [bal('w1'), bal('w2')], isError: false, error: null }),
  useWalletTransfers: () => ({ data: { rows: [transfer], capped: false }, isError: false, error: null }),
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

const { WalletsManager } = await import('@/components/WalletsManager')
const { runVisualTest } = await import('@/components/visual-harness')

const PROMPT_HEAD =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500&display=swap">'

describe('WalletsManager transfer-history row fits "จาก → ไป" at 360px (real browser)', () => {
  it(
    `"${LINE_TEXT}" is clipped by no more than the accepted budget`,
    async (ctx) => {
      const markup = renderToStaticMarkup(createElement(WalletsManager, { onClose: () => {} }))

      await runVisualTest(
        ctx,
        { name: 'wallet-transfer-row-360', markup, headHtml: PROMPT_HEAD, viewport: { width: 360, height: 900 } },
        async (page) => {
          await page.evaluate(() => document.fonts.ready)
          const promptLoaded = await page.evaluate(() => document.fonts.check('16px "Prompt"'))
          if (!promptLoaded) {
            const msg = 'Prompt webfont did not load — 360px width baseline needs it'
            if (process.env.CI) throw new Error(`[wallet-transfer-row-360] ${msg}`)
            // eslint-disable-next-line no-console
            console.warn(`[wallet-transfer-row-360] ${msg} (local, not CI) — skipping`)
            ctx.skip()
            return
          }

          const clip = await page.evaluate((text) => {
            const el = Array.from(document.querySelectorAll('p')).find(
              (p) => (p.textContent || '').replace(/\s+/g, ' ').trim() === text,
            )
            if (!el) return null
            return { scroll: el.scrollWidth, client: el.clientWidth }
          }, LINE_TEXT)

          expect(clip, `the "จาก → ไป" <p> for "${LINE_TEXT}" must be in the DOM`).not.toBeNull()
          // measured 6px today; budget = 6 + font-metric wobble. A regression that
          // puts the amount back on this line clips it by ~90px, far past this.
          expect(
            clip!.scroll - clip!.client,
            `"${LINE_TEXT}" clipped by ${clip!.scroll - clip!.client}px at 360px (budget 8)`,
          ).toBeLessThanOrEqual(8)
        },
      )
    },
    20_000,
  )
})
