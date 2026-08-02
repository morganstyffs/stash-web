import { useMemo, useState } from 'react'
import {
  IconAlertTriangle,
  IconChevronDown,
  IconPencil,
  IconPlus,
  IconTrash,
  IconWallet,
} from '@tabler/icons-react'
import { Overlay } from '@/components/ui'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/components/Toast'
import {
  useDeleteWallet,
  useUpsertWallet,
  useWalletBalances,
  useWallets,
} from '@/hooks/useSettings'
import { useHideBalance } from '@/hooks/useHideBalance'
import { translateError } from '@/lib/errors'
import { formatBaht, MASKED_BAHT } from '@/lib/format'
import type { Wallet, WalletBalance, WalletType } from '@/lib/db'

const TYPES: { key: WalletType; label: string }[] = [
  { key: 'cash', label: 'เงินสด' },
  { key: 'bank', label: 'ธนาคาร' },
  { key: 'promptpay', label: 'พร้อมเพย์' },
]

function typeLabel(t: WalletType): string {
  return TYPES.find((x) => x.key === t)?.label ?? t
}

interface FormState {
  id?: string
  name: string
  type: WalletType
  /** ยอดตั้งต้น as raw input text. '' means 0 (the column is NOT NULL DEFAULT 0),
   *  so create opens blank and blank saves as 0. On EDIT this is seeded from the
   *  stored value (a real fact, not a guess) so saving name/type never wipes it. */
  openingBalance: string
}

/** Keep digits and at most one decimal point; drop everything else (letters, a
 *  second dot, a minus — an opening balance is money-on-hand, never negative). */
function sanitizeMoney(s: string): string {
  const cleaned = s.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '')
}

/** Masked while ซ่อนยอดเงิน is on, otherwise the figure — one helper so every
 *  money surface in this sheet masks identically (ShopProfitCard pattern). */
function money(v: number, hide: boolean): string {
  return hide ? MASKED_BAHT : formatBaht(v)
}

/** A balance can be negative (opening lower than what's been spent) — never
 *  clamp it to 0. Shown with a unicode minus so the sign reads at a glance; the
 *  caller adds the expense colour. Masked as a bare placeholder so the sign
 *  can't leak while scanning. */
function balanceText(v: number, hide: boolean): string {
  if (hide) return MASKED_BAHT
  return v < 0 ? `−${formatBaht(-v)}` : formatBaht(v)
}

const PENDING = '…'

/** The where-did-this-come-from panel: the RPC's own components, so the balance
 *  is never re-derived on the client (the wallet-balance formula uses raw
 *  transaction `type`, unlike any budget predicate — two versions would drift).
 *  Transfer lines only appear once the wallet has actually moved money. */
function BalanceBreakdown({ bal, hide }: { bal: WalletBalance; hide: boolean }) {
  const hasTransfers = bal.transfer_in > 0 || bal.transfer_out > 0
  return (
    <div className="mb-2.5 flex flex-col gap-1 rounded-[10px] bg-fill px-3 py-2 text-[12px]">
      <BreakdownRow label="ยอดตั้งต้น" value={money(bal.opening_balance, hide)} />
      <BreakdownRow label="รับเข้า" value={hide ? MASKED_BAHT : `+${formatBaht(bal.income_total)}`} />
      <BreakdownRow
        label="จ่ายออก"
        value={hide ? MASKED_BAHT : `−${formatBaht(bal.expense_total)}`}
      />
      {hasTransfers && (
        <>
          <BreakdownRow
            label="โอนเข้า"
            value={hide ? MASKED_BAHT : `+${formatBaht(bal.transfer_in)}`}
          />
          <BreakdownRow
            label="โอนออก"
            value={hide ? MASKED_BAHT : `−${formatBaht(bal.transfer_out)}`}
          />
        </>
      )}
      <div className="my-0.5 border-t-[0.5px] border-hairline" />
      <BreakdownRow label="คงเหลือ" value={balanceText(bal.balance, hide)} strong />
    </div>
  )
}

function BreakdownRow({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={strong ? 'font-medium' : 'text-muted'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-medium' : 'text-muted'}`}>{value}</span>
    </div>
  )
}

export function WalletsManager({ onClose }: { onClose: () => void }) {
  const { data: wallets } = useWallets()
  const balancesQ = useWalletBalances()
  const upsert = useUpsertWallet()
  const del = useDeleteWallet()
  const toast = useToast()
  const { hideBalance } = useHideBalance()
  const [form, setForm] = useState<FormState | null>(null)
  const [confirming, setConfirming] = useState<Wallet | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // wallet_id -> its balance row, so a per-wallet lookup is O(1).
  const balanceById = useMemo(() => {
    const m = new Map<string, WalletBalance>()
    for (const b of balancesQ.data ?? []) m.set(b.wallet_id, b)
    return m
  }, [balancesQ.data])

  // The all-wallets total is the SUM OF AUTHORITATIVE per-wallet balances — it
  // adds up numbers the RPC already computed, it does not re-derive them from
  // the ledger. Only meaningful once every balance has loaded.
  const total = useMemo(() => {
    if (!balancesQ.data) return null
    return balancesQ.data.reduce((s, b) => s + b.balance, 0)
  }, [balancesQ.data])

  async function confirmRemove() {
    if (!confirming) return
    try {
      await del.mutateAsync(confirming.id)
      toast.success('ลบกระเป๋าแล้ว')
      setConfirming(null)
    } catch (e) {
      toast.error(translateError(e))
      setConfirming(null)
    }
  }

  async function save() {
    if (!form) return
    const opening = Number(form.openingBalance || '0')
    if (!Number.isFinite(opening) || opening < 0) {
      toast.error('ยอดตั้งต้นต้องเป็นจำนวนเงินที่ไม่ติดลบ')
      return
    }
    try {
      await upsert.mutateAsync({
        id: form.id,
        name: form.name.trim(),
        type: form.type,
        opening_balance: opening,
      })
      toast.success(form.id ? 'บันทึกกระเป๋าแล้ว' : 'เพิ่มกระเป๋าแล้ว')
      setForm(null)
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  return (
    <Overlay
      title="กระเป๋าเงิน"
      onClose={onClose}
      action={
        <button
          aria-label="เพิ่มกระเป๋า"
          onClick={() => setForm({ name: '', type: 'cash', openingBalance: '' })}
        >
          <IconPlus size={20} className="text-brand-deep" />
        </button>
      }
    >
      {form && (
        <div className="mb-4 rounded-card border-[0.5px] border-hairline p-3.5">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ชื่อกระเป๋า"
            className="mb-2.5 w-full rounded-input border-[0.5px] border-hairline bg-fill px-3 py-2.5 text-[13px] outline-none focus:border-brand"
          />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setForm({ ...form, type: t.key })}
                className={`rounded-pill px-4 py-[5px] text-[12px] ${
                  form.type === t.key
                    ? 'bg-brand-tint font-medium text-brand-ink'
                    : 'border-[0.5px] border-hairline text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ยอดตั้งต้น — opens blank (no guessed prefill); on edit it carries the
              stored value so saving never wipes it. */}
          <label htmlFor="wallet-opening" className="mb-1 block text-[12px] text-muted">
            เงินที่มีอยู่ในกระเป๋านี้ตอนเริ่มใช้แอป
          </label>
          <div className="flex items-center rounded-input border-[0.5px] border-hairline bg-fill px-3 focus-within:border-brand">
            <span className="mr-1 text-[13px] text-faint">฿</span>
            <input
              id="wallet-opening"
              value={form.openingBalance}
              onChange={(e) =>
                setForm({ ...form, openingBalance: sanitizeMoney(e.target.value) })
              }
              inputMode="decimal"
              placeholder="0"
              className="w-full bg-transparent py-2.5 text-[13px] tabular-nums outline-none"
            />
          </div>
          <p className="mb-3 mt-1 text-[11px] leading-relaxed text-faint">
            เว้นว่างได้ = 0 · แก้ทีหลังได้ตลอด แล้วยอดคงเหลือจะขยับตาม (ตั้งใจ ไม่ใช่ที่ผิดพลาด)
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => setForm(null)}
              className="rounded-btn border-[0.5px] border-hairline px-4 py-2.5 text-[13px] font-medium"
            >
              ยกเลิก
            </button>
            <button
              disabled={!form.name.trim() || upsert.isPending}
              onClick={save}
              className="flex-1 rounded-btn bg-brand-deep py-2.5 text-[13px] font-medium text-white disabled:opacity-40"
            >
              บันทึก
            </button>
          </div>
        </div>
      )}

      {/* เงินในกระเป๋าทั้งหมด — the sum of actual money on hand. Deliberately a
          quiet summary line, not a hero: หน้าแรก's "เหลือใช้เดือนนี้" (safeToSpend)
          already answers "how much can I spend"; this answers the different
          question "how much do I actually have", so the subtitle keeps them
          apart (§11.4-6). */}
      {(wallets ?? []).length > 0 && (
        <div className="mb-3 flex items-baseline justify-between gap-3 border-b-[0.5px] border-hairline pb-3">
          <div className="min-w-0">
            <p className="text-[13px] text-muted">เงินในกระเป๋าทั้งหมด</p>
            <p className="text-[11px] text-faint">เงินที่มีอยู่จริงตอนนี้ · คนละอย่างกับ “เหลือใช้เดือนนี้”</p>
          </div>
          <p
            className={`shrink-0 text-[17px] font-semibold tabular-nums ${
              total != null && total < 0 ? 'text-expense' : ''
            }`}
          >
            {balancesQ.isError ? '—' : total == null ? PENDING : balanceText(total, hideBalance)}
          </p>
        </div>
      )}

      {/* A balance error must reach the user — never swallow it, and never let a
          failed load read as ฿0. */}
      {balancesQ.isError && (
        <p className="mb-3 inline-flex items-start gap-1.5 rounded-[10px] bg-expense-bg px-3 py-2 text-[12px] text-expense">
          <IconAlertTriangle size={14} aria-hidden className="mt-[1px] shrink-0" />
          โหลดยอดคงเหลือไม่สำเร็จ · {translateError(balancesQ.error)}
        </p>
      )}

      {(wallets ?? []).map((w) => {
        const bal = balanceById.get(w.id)
        const expanded = expandedId === w.id
        return (
          <div key={w.id} className="border-b-[0.5px] border-hairline py-2.5 last:border-b-0">
            <div className="flex items-center gap-3">
              <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-fill">
                <IconWallet size={16} className="text-muted" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px]">{w.name}</p>
                {/* balance + type sit on the subline; the balance figure is
                    shrink-0 so it NEVER silently clips — only the type label may
                    truncate. Tapping toggles the breakdown. */}
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={`ที่มาของยอดคงเหลือ ${w.name}`}
                  disabled={!bal}
                  onClick={() => setExpandedId(expanded ? null : w.id)}
                  className="mt-0.5 flex w-full items-center gap-1.5 text-left disabled:opacity-100"
                >
                  <span
                    className={`shrink-0 text-[12.5px] font-medium tabular-nums ${
                      bal && bal.balance < 0 ? 'text-expense' : ''
                    }`}
                  >
                    {balancesQ.isError
                      ? '—'
                      : bal
                        ? balanceText(bal.balance, hideBalance)
                        : PENDING}
                  </span>
                  <span className="truncate text-[11px] text-faint">· {typeLabel(w.type)}</span>
                  {bal && (
                    <IconChevronDown
                      size={13}
                      aria-hidden
                      className={`shrink-0 text-faint transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>
              </div>
              <button
                aria-label="แก้ไข"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-fill"
                onClick={() =>
                  setForm({
                    id: w.id,
                    name: w.name,
                    type: w.type,
                    openingBalance: w.opening_balance ? String(w.opening_balance) : '',
                  })
                }
              >
                <IconPencil size={16} className="text-faint" />
              </button>
              <button
                aria-label="ลบ"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-expense-bg disabled:opacity-50"
                disabled={del.isPending}
                onClick={() => setConfirming(w)}
              >
                <IconTrash size={16} className="text-faint" />
              </button>
            </div>

            {expanded && bal && (
              <div className="mt-2">
                <BalanceBreakdown bal={bal} hide={hideBalance} />
              </div>
            )}
          </div>
        )
      })}

      {confirming && (
        <ConfirmDialog
          title={`ลบกระเป๋า “${confirming.name}” ?`}
          message="ถ้ากระเป๋านี้ยังมีรายการอยู่จะลบไม่ได้"
          busy={del.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={confirmRemove}
        />
      )}
    </Overlay>
  )
}
