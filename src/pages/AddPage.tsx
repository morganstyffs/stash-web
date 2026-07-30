import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconAlertCircle,
  IconArrowLeft,
  IconBackspace,
  IconCalendar,
  IconCheck,
  IconPlus,
  IconStar,
  IconWallet,
} from '@tabler/icons-react'
import { useCategories, useFavorites, useUpsertFavorite } from '@/hooks/useLookups'
import { useAddTransaction } from '@/hooks/useAddTransaction'
import { useWallets } from '@/hooks/useSettings'
import { CategoriesManager } from '@/components/CategoriesManager'
import { FavoritesManager } from '@/components/FavoritesManager'
import { useToast } from '@/components/Toast'
import { categoryIcon } from '@/lib/icons'
import { formatBaht, formatDayShort } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import { translateError } from '@/lib/errors'
import type { Favorite, TransactionType } from '@/lib/db'

const intFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 })
/** Amount as it appears inside a fast-label's default name — grouped, up to 2dp, no ฿. */
const labelAmountFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 })

const MAX_DIGITS = 9

// ── Pure logic (exported for tests) ─────────────────────────────────────────

/**
 * Default name for a fast-label (favorite). B11: the old code used the bare
 * category name, so "กาแฟ 60" and "กาแฟ 120" both saved as "กาแฟ" and became
 * indistinguishable. Now the amount is folded into the name when present, and a
 * missing category falls back to a generic label.
 */
export function favoriteLabel(
  categoryName: string | null | undefined,
  amount: number | null,
): string {
  const name = categoryName?.trim() || 'รายการโปรด'
  if (amount != null && amount > 0) return `${name} ${labelAmountFmt.format(amount)}`
  return name
}

/**
 * Why the save button is disabled, as user-facing text — or null when the entry
 * is complete and the bar should hide. The four states the spec enumerates.
 */
export function saveBlockedReason(amount: number, categoryId: string | null): string | null {
  const noAmount = amount <= 0
  const noCategory = !categoryId
  if (noAmount && noCategory) return 'ใส่จำนวนเงิน และเลือกหมวด'
  if (noAmount) return 'ใส่จำนวนเงิน'
  if (noCategory) return 'เลือกหมวด'
  return null
}

/** Digits currently entered (the decimal point doesn't count toward the cap). */
function digitCount(s: string): number {
  return s.replace('.', '').length
}

/**
 * Reducer for the amount string driven by every keypad/aux button. Kept pure so
 * the 000 / clear / decimal / cap rules can be unit-tested without the DOM.
 * Keys: a digit ('0'–'9'), '.', 'back', '000', 'clear'.
 */
export function pressKey(prev: string, key: string): string {
  switch (key) {
    case 'back':
      return prev.slice(0, -1)
    case 'clear':
      return ''
    case '000': {
      // Only meaningful on a non-zero integer with no decimal yet, and never
      // past the 9-digit ceiling (append nothing rather than overflow).
      if (prev === '' || prev === '0' || prev.includes('.')) return prev
      if (digitCount(prev) + 3 > MAX_DIGITS) return prev
      return prev + '000'
    }
    case '.': {
      if (prev.includes('.')) return prev
      return (prev === '' ? '0' : prev) + '.'
    }
    default: {
      // a single digit
      if (prev.includes('.')) {
        const [, dec = ''] = prev.split('.')
        if (dec.length >= 2) return prev // max 2 decimals
      }
      if (prev === '0') return key // no leading zero
      if (digitCount(prev) >= MAX_DIGITS) return prev // sane cap
      return prev + key
    }
  }
}

/** Accessible name for a fast-label button (spec: `${ชื่อป้าย} ${ยอด} บาท`). */
function favoriteAria(label: string, amount: number | null): string {
  return amount != null ? `${label} ${intFmt.format(amount)} บาท` : `${label} ยังไม่ระบุยอด`
}

// ── Component ────────────────────────────────────────────────────────────────

export function AddPage() {
  const navigate = useNavigate()
  const catsQ = useCategories()
  const favQ = useFavorites()
  const walletsQ = useWallets()
  const add = useAddTransaction()
  const saveFav = useUpsertFavorite()
  const toast = useToast()

  const today = todayISO()
  const [type, setType] = useState<TransactionType>('expense')
  const [amountStr, setAmountStr] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [walletId, setWalletId] = useState<string | null>(null)
  const [dateStr, setDateStr] = useState(today)
  const [note, setNote] = useState('')
  const [favSaved, setFavSaved] = useState(false)
  const [managingCats, setManagingCats] = useState(false)
  const [managingFavs, setManagingFavs] = useState(false)

  // Local midnight from the numeric parts (via formatDayShort's device-local
  // formatter) cancels out — the label is the correct day in every timezone.
  // Keep the 'T00:00:00' suffix: it is verified-correct, not a rule-18 slip.
  const dateLabel = dateStr === today ? 'วันนี้' : formatDayShort(new Date(dateStr + 'T00:00:00'))

  // Default the wallet to the first one once wallets load (wallet_id is optional
  // in the schema, so if the user has none we simply save without a wallet).
  useEffect(() => {
    if (walletId == null && walletsQ.data && walletsQ.data.length > 0) {
      setWalletId(walletsQ.data[0].id)
    }
  }, [walletsQ.data, walletId])

  // Category chips: categories of the chosen kind, excluding stock-intake
  // categories and three system categories that only ever come from their own
  // flows — 'stock_cogs' (a sale's cost leg) and both debt-repayment categories
  // ('debt_repayment_income' / 'debt_repayment_expense', only ever from
  // debt_settle). 'ขายสต็อก' income (system_key stock_sale_income) stays
  // selectable so off-book resale income can be logged by hand; there is no
  // equivalent off-book case for a debt settlement.
  const categories = useMemo(
    () =>
      (catsQ.data ?? []).filter(
        (c) =>
          c.kind === type &&
          !c.is_stock_category &&
          c.system_key !== 'stock_cogs' &&
          c.system_key !== 'debt_repayment_income' &&
          c.system_key !== 'debt_repayment_expense',
      ),
    [catsQ.data, type],
  )

  const favorites = favQ.data ?? []

  const amount = Number(amountStr || '0')
  const reason = saveBlockedReason(amount, categoryId)
  const canSave = reason == null && !add.isPending

  const selectedCat = categories.find((c) => c.id === categoryId)
  const pendingFavName = favoriteLabel(selectedCat?.name, amount > 0 ? amount : null)

  function press(key: string) {
    setAmountStr((prev) => pressKey(prev, key))
  }

  function switchType(next: TransactionType) {
    setType(next)
    setCategoryId(null)
    setFavSaved(false)
  }

  function pickCategory(id: string) {
    setCategoryId(id)
    setFavSaved(false)
  }

  // Apply a fast-label. B13: the amount is set on *every* tap — a label with no
  // amount clears whatever was in the box, so it can't fuse with a stale value.
  function applyFavorite(f: Favorite) {
    setType(f.type)
    setAmountStr(f.amount != null ? String(f.amount) : '')
    setCategoryId(f.category_id)
    if (f.wallet_id) setWalletId(f.wallet_id)
    if (f.note) setNote(f.note)
    setFavSaved(false)
  }

  async function save() {
    if (!canSave) return
    try {
      await add.mutateAsync({
        type,
        amount,
        categoryId,
        walletId,
        date: dateStr,
        note: note.trim() || null,
      })
      toast.success('บันทึกรายการแล้ว')
      navigate('/')
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  // Save the current entry as a fast-label. Name defaults to category + amount
  // (B11); the amount is captured only when one has been entered.
  async function saveFavorite() {
    if (!categoryId) return
    try {
      await saveFav.mutateAsync({
        label: favoriteLabel(selectedCat?.name, amount > 0 ? amount : null),
        type,
        amount: amount > 0 ? amount : null,
        category_id: categoryId,
        wallet_id: walletId,
        note: note.trim() || null,
      })
      setFavSaved(true)
      toast.success('บันทึกเป็นป้ายด่วนแล้ว')
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  // amount display split
  const [intRaw, decRaw] = amountStr.split('.')
  const intDisplay = intFmt.format(Number(intRaw || '0'))
  const decSuffix = amountStr.includes('.') ? `.${decRaw ?? ''}` : '.00'

  const zeroDisabled = amountStr === '' || amountStr === '0' || amountStr.includes('.')
  const clearDisabled = amountStr === ''

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-white">
      {/* header */}
      <div className="flex shrink-0 items-center justify-between px-[18px] pb-3 pt-4">
        <button aria-label="ย้อนกลับ" onClick={() => navigate('/')}>
          <IconArrowLeft size={20} className="text-muted" />
        </button>
        <p className="text-[16px] font-medium">เพิ่มรายการ</p>
        {/* date pill — opens the native date picker; backdating is allowed up to today */}
        <label className="relative flex items-center gap-1 rounded-pill bg-brand-tint px-[11px] py-1 text-[12px] font-medium text-brand-ink">
          <IconCalendar size={13} />
          {dateLabel}
          <input
            type="date"
            value={dateStr}
            max={today}
            onChange={(e) => setDateStr(e.target.value || today)}
            aria-label="เลือกวันที่"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      </div>

      {/* scrollzone — everything above the dock. Shrinks/scrolls on short screens
          so the keypad + save button below stay pinned to the bottom. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* fast-labels (favorites) on top — the fastest path to a saved entry.
            Hidden entirely until the user has some, so it never wastes space. */}
        {favorites.length > 0 && (
          <div className="pt-1">
            <div className="flex items-center justify-between px-4 pb-[7px]">
              <p className="flex items-center gap-1 text-[11px] text-muted">
                <IconStar size={12} />
                กดครั้งเดียวจบ
              </p>
              <button
                type="button"
                onClick={() => setManagingFavs(true)}
                className="text-[11px] font-medium text-brand-deep"
              >
                จัดการ
              </button>
            </div>
            <div className="no-scrollbar flex gap-[7px] overflow-x-auto px-4 pb-2.5">
              {favorites.map((f) => (
                <FastLabel key={f.id} fav={f} onClick={() => applyFavorite(f)} />
              ))}
            </div>
          </div>
        )}

        {/* จ่าย / รับ */}
        <div className="mb-1.5 flex justify-center gap-1.5">
          {(['expense', 'income'] as const).map((t) => (
            <button
              key={t}
              onClick={() => switchType(t)}
              aria-pressed={type === t}
              className={`rounded-pill px-4 py-[5px] text-[12px] ${
                type === t
                  ? 'bg-brand-tint font-medium text-brand-ink'
                  : 'border-[0.5px] border-hairline text-muted'
              }`}
            >
              {t === 'expense' ? 'จ่าย' : 'รับ'}
            </button>
          ))}
        </div>

        {/* amount + 000 / ล้าง (stacked to the right, number stays centred) */}
        <div className="relative px-4 pb-2.5 pt-0.5 text-center">
          <p className="text-[40px] font-medium tracking-[-1px]">
            <span className="text-[26px] text-muted">฿</span>
            {intDisplay}
            <span className="text-muted">{decSuffix}</span>
          </p>
          <div className="absolute right-4 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
            <button
              type="button"
              onClick={() => press('000')}
              disabled={zeroDisabled}
              aria-label="เติมศูนย์สามตัว"
              className="rounded-[9px] bg-fill px-2.5 py-1 text-[12px] font-medium text-muted disabled:opacity-40"
            >
              000
            </button>
            <button
              type="button"
              onClick={() => press('clear')}
              disabled={clearDisabled}
              aria-label="ล้างจำนวนเงิน"
              className="rounded-[9px] bg-fill px-2.5 py-1 text-[12px] font-medium text-muted disabled:opacity-40"
            >
              ล้าง
            </button>
          </div>
        </div>

        {/* category — wraps so every category is visible at once (no hidden overflow) */}
        <div className="px-4 pb-2.5">
          <p className="mb-[7px] text-[11px] text-muted">
            {type === 'expense' ? 'หมวดรายจ่าย' : 'หมวดรายรับ'}
          </p>
          <div className="flex flex-wrap gap-[7px]">
            {categories.map((c) => {
              const Icon = categoryIcon(c.icon)
              const active = c.id === categoryId
              return (
                <button
                  key={c.id}
                  onClick={() => pickCategory(c.id)}
                  aria-pressed={active}
                  className="flex min-h-[44px] items-center"
                >
                  <span
                    className={`flex items-center gap-1 rounded-pill px-[13px] py-[7px] text-[12px] ${
                      active ? 'bg-brand-tint font-medium text-brand-ink' : 'bg-fill text-muted'
                    }`}
                  >
                    <Icon size={14} />
                    {c.name}
                  </span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setManagingCats(true)}
              className="flex min-h-[44px] shrink-0 items-center"
            >
              <span className="flex items-center gap-1 rounded-pill bg-fill px-[13px] py-[7px] text-[12px] text-faint">
                <IconPlus size={14} />
                เพิ่มหมวด
              </span>
            </button>
          </div>
        </div>

        {/* wallet selector (only when the user has wallets) */}
        {walletsQ.data && walletsQ.data.length > 0 && (
          <div className="no-scrollbar flex items-center gap-[7px] overflow-x-auto px-4 pb-2.5">
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
              <IconWallet size={13} />
              กระเป๋า
            </span>
            {walletsQ.data.map((w) => {
              const active = w.id === walletId
              return (
                <button
                  key={w.id}
                  onClick={() => setWalletId(w.id)}
                  aria-pressed={active}
                  className="flex min-h-[44px] shrink-0 items-center"
                >
                  <span
                    className={`rounded-pill px-[13px] py-[6px] text-[12px] ${
                      active ? 'bg-brand-tint font-medium text-brand-ink' : 'bg-fill text-muted'
                    }`}
                  >
                    {w.name}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* optional note */}
        <div className="px-4 pb-2.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="โน้ต (ไม่ใส่ก็ได้)"
            className="w-full rounded-input border-[0.5px] border-hairline bg-fill px-[11px] py-[9px] text-[13px] outline-none placeholder:text-faint focus:border-brand"
          />
        </div>

        {/* save current entry as a fast-label — names the label it will create */}
        <div className="px-4 pb-2.5 pt-0.5">
          <button
            onClick={saveFavorite}
            disabled={!categoryId || saveFav.isPending || favSaved}
            className="flex items-center gap-1 text-left text-[12px] font-medium text-brand-deep disabled:text-faint"
          >
            <IconStar size={13} className="shrink-0" />
            {!categoryId
              ? 'บันทึกเป็นป้ายด่วน'
              : favSaved
                ? `บันทึก “${pendingFavName}” แล้ว`
                : `บันทึก “${pendingFavName}” เป็นป้ายด่วน`}
          </button>
        </div>

        {favorites.length === 0 && (
          <div className="mx-4 mb-4 flex items-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-chevron px-3.5 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border-[1.5px] border-dashed border-chevron">
              <IconStar size={15} className="text-faint" />
            </div>
            <p className="text-[11.5px] leading-relaxed text-muted">
              ยังไม่มีป้ายด่วน — กด{' '}
              <span className="font-medium text-brand-deep">☆ บันทึกเป็นป้ายด่วน</span> ด้านบน
              หลังกรอกยอด+เลือกหมวด ครั้งหน้าจะแตะครั้งเดียวจบ
            </p>
          </div>
        )}
      </div>

      {/* dock — keypad + reason + save. Always pinned to the bottom. */}
      <div className="shrink-0">
        <div className="grid grid-cols-3 px-3 pb-2 text-center">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
            <KeypadKey key={k} onClick={() => press(k)}>
              {k}
            </KeypadKey>
          ))}
          <KeypadKey onClick={() => press('.')} muted>
            .
          </KeypadKey>
          <KeypadKey onClick={() => press('0')}>0</KeypadKey>
          <KeypadKey onClick={() => press('back')} aria-label="ลบ">
            <IconBackspace size={21} className="mx-auto text-muted" />
          </KeypadKey>
        </div>

        {/* why-you-can't-save bar — icon + text (never colour alone); role=status
            so a screen reader announces it as the reason changes */}
        {reason && (
          <div
            role="status"
            className="mx-4 mb-2 flex items-center gap-1.5 rounded-input bg-warn-bg px-3 py-2 text-[12px] font-medium text-warn-ink"
          >
            <IconAlertCircle size={15} className="shrink-0" />
            {reason}
          </div>
        )}

        {add.error && (
          <p className="px-4 pb-2 text-center text-[12px] text-expense">
            {translateError(add.error)}
          </p>
        )}

        <div className="px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-1">
          <button
            onClick={save}
            disabled={!canSave}
            className="flex w-full items-center justify-center gap-1 rounded-btn bg-brand-deep py-3.5 text-[15px] font-medium text-white disabled:opacity-40"
          >
            <IconCheck size={17} />
            {add.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>

      {managingCats && <CategoriesManager onClose={() => setManagingCats(false)} />}
      {managingFavs && <FavoritesManager onClose={() => setManagingFavs(false)} />}
    </div>
  )
}

/**
 * A woven fast-label chip — same fabric/thread language as the SKU labels on the
 * stock page. Amount reads big on top, name small below (the eye hunts the
 * amount first); income labels wear the green fabric so จ่าย/รับ tell apart
 * before the tap. `amount = null` shows "ใส่ยอด" in the amount slot.
 */
function FastLabel({ fav, onClick }: { fav: Favorite; onClick: () => void }) {
  const fabric = fav.type === 'income' ? 'bg-brand-fabric-income' : 'bg-brand-fabric-stock'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={favoriteAria(fav.label, fav.amount)}
      className={`woven relative flex min-h-[46px] shrink-0 flex-col justify-center overflow-hidden rounded-[9px] px-3 py-1.5 text-left text-brand-thread ${fabric}`}
    >
      <span aria-hidden className="selvedge absolute inset-x-0 top-0 h-[3px]" />
      <span aria-hidden className="selvedge absolute inset-x-0 bottom-0 h-[3px]" />
      <span className="text-[15px] font-medium leading-tight tabular-nums">
        {fav.amount != null ? formatBaht(fav.amount) : 'ใส่ยอด'}
      </span>
      <span className="text-[10px] leading-tight text-brand-thread/70">{fav.label}</span>
    </button>
  )
}

function KeypadKey({
  children,
  onClick,
  muted,
  ...rest
}: {
  children: React.ReactNode
  onClick: () => void
  muted?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      className={`min-h-[44px] rounded-[12px] py-[13px] text-[23px] font-medium active:bg-fill ${
        muted ? 'text-muted' : ''
      }`}
      {...rest}
    >
      {children}
    </button>
  )
}
