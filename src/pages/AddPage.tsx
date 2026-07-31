import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { useDeleteTransaction } from '@/hooks/useTransactions'
import { useEntryHints } from '@/hooks/useEntryHints'
import { useLongPress } from '@/hooks/useLongPress'
import { useWallets } from '@/hooks/useSettings'
import { CategoriesManager } from '@/components/CategoriesManager'
import { FavoritesManager } from '@/components/FavoritesManager'
import { useToast } from '@/components/Toast'
import { categoryIcon } from '@/lib/icons'
import { preferredWalletFor, topCategories } from '@/lib/entryHints'
import { formatBaht, formatDayShort } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import { translateError } from '@/lib/errors'
import type { Category, Favorite, TransactionType } from '@/lib/db'

const intFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 })
/** Amount as it appears inside a fast-label's default name — grouped, up to 2dp, no ฿. */
const labelAmountFmt = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 })
/** Amount read aloud by the aria-live region — a plain money reading ("1,234.00 บาท"),
 *  never the char-split ฿ / int / dec spans a screen reader would otherwise spell out. */
const ariaAmountFmt = new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

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
 * Signature of the five values that make up one fast-label. The "saved" button
 * decides whether the current entry has already been saved as a label by
 * comparing signatures — NOT a boolean flag reset by hand in each editing path.
 * A hand-reset flag went stale the moment a field it didn't know about changed
 * (the bug: save "อาหาร 100", then key another digit → button still claimed it had
 * saved "อาหาร 1,005"). note is trimmed to match how a label is actually saved;
 * JSON.stringify keeps the parts unambiguous even when a note contains the
 * delimiter, and keeps null distinct from '' (no category vs an empty one).
 */
export function favoriteSignature(f: {
  type: TransactionType
  amount: number
  categoryId: string | null
  walletId: string | null
  note: string
}): string {
  return JSON.stringify([f.type, f.amount, f.categoryId, f.walletId, f.note.trim()])
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

/** Accessible name for a fast-label button. Ends by naming both gestures so a
 *  screen-reader user knows the label does more than a plain tap. */
function favoriteAria(label: string, amount: number | null): string {
  const head = amount != null ? `${label} ${intFmt.format(amount)} บาท` : `${label} ยังไม่ระบุยอด`
  return `${head} · แตะเพื่อเติม กดค้างเพื่อบันทึก`
}

// ── Keyboard → keypad wiring (exported for tests) ────────────────────────────

export type KeypadAction =
  | { kind: 'press'; key: string } // feed on to pressKey()
  | { kind: 'save' }

/**
 * Map one physical key to what it should do on this page — or null when the
 * keystroke is none of our business. Kept pure (takes the minimal event shape,
 * not a real KeyboardEvent) so tests call it with plain objects, no jsdom, no
 * cast (conventions 10/11). It maps keys onto the SAME pressKey() reducer the
 * on-screen keypad uses — there is no second number-entry rulebook here.
 *
 * The two conditions that need the live DOM — a sheet being open, and Enter
 * landing while a <button> is focused — are decided in the effect, not here.
 */
export function keypadActionFromKey(e: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  isComposing?: boolean
}): KeypadAction | null {
  // A held modifier means the user is driving the browser (Cmd+R / Ctrl+F), and
  // isComposing means the Thai IME is mid-character — never our keystroke.
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  if (e.isComposing) return null

  const { key } = e
  if (key.length === 1 && key >= '0' && key <= '9') return { kind: 'press', key }
  // ',' maps to the decimal point too: some numpad layouts send ',' from the
  // decimal key, and ',' has no other meaning in a Thai amount field.
  if (key === '.' || key === ',') return { kind: 'press', key: '.' }
  if (key === 'Backspace') return { kind: 'press', key: 'back' }
  if (key === 'Delete') return { kind: 'press', key: 'clear' }
  if (key === 'Enter') return { kind: 'save' }
  // Everything else — letters, F-keys, arrows, Escape (which belongs to any open
  // sheet) — is left alone.
  return null
}

/**
 * Is this keystroke's target a place where the user is typing text (the note
 * field, the hidden date <input>, any field inside a manager sheet)? Those must
 * never leak into the amount — typing a note must not move the money. Minimal
 * element shape so tests pass a plain object (convention 11).
 */
export function isTypingTarget(
  el: { tagName: string; isContentEditable?: boolean } | null,
): boolean {
  if (!el) return false
  if (el.isContentEditable) return true
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

// ── Component ────────────────────────────────────────────────────────────────

export function AddPage() {
  const navigate = useNavigate()
  const catsQ = useCategories()
  const favQ = useFavorites()
  const walletsQ = useWallets()
  const hintsQ = useEntryHints()
  const add = useAddTransaction()
  const del = useDeleteTransaction()
  const saveFav = useUpsertFavorite()
  const toast = useToast()

  const today = todayISO()
  // Optional prefill (e.g. the ยอดค้าง "บันทึกรายการเงินของคุณ" nudge). Read once
  // on mount; the user still picks the category + wallet and can change anything.
  const location = useLocation()
  const prefill = (
    location.state as { prefill?: { type?: TransactionType; amount?: number; note?: string } } | null
  )?.prefill
  const [type, setType] = useState<TransactionType>(prefill?.type ?? 'expense')
  const [amountStr, setAmountStr] = useState(
    prefill?.amount != null && prefill.amount > 0 ? String(prefill.amount) : '',
  )
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [walletId, setWalletId] = useState<string | null>(null)
  // Once the user picks a wallet by hand, stop guessing for the rest of this
  // page — re-guessing over a deliberate choice is the most irritating outcome
  // (rule 2). Reset only by leaving the page (a fresh mount).
  const [walletTouched, setWalletTouched] = useState(false)
  const [dateStr, setDateStr] = useState(today)
  const [note, setNote] = useState(prefill?.note ?? '')
  // Signature of the fields that made up the last successfully-saved fast-label
  // (null = none saved this session). favSaved is derived from it below.
  const [savedFavSig, setSavedFavSig] = useState<string | null>(null)
  const [managingCats, setManagingCats] = useState(false)
  const [managingFavs, setManagingFavs] = useState(false)
  // The label just saved by a long-press — drives the on-label checkmark so the
  // confirmation lives under the finger, not only in the toast down at the foot.
  const [justSavedId, setJustSavedId] = useState<string | null>(null)
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Id of the most recent save toast, so we dismiss it before showing the next
  // one — three rapid saves must not stack three unreadable toasts, and "เลิกทำ"
  // must always mean the latest entry. Shared by both save paths (the save
  // button and the long-press quick-save) via showSavedToast below.
  const lastSaveToastId = useRef<number | null>(null)

  // Drop the checkmark timer if the page unmounts mid-flash.
  useEffect(() => {
    return () => {
      if (justSavedTimer.current != null) clearTimeout(justSavedTimer.current)
    }
  }, [])

  // Local midnight from the numeric parts (via formatDayShort's device-local
  // formatter) cancels out — the label is the correct day in every timezone.
  // Keep the 'T00:00:00' suffix: it is verified-correct, not a rule-18 slip.
  const dateLabel = dateStr === today ? 'วันนี้' : formatDayShort(new Date(dateStr + 'T00:00:00'))

  // The wallet an unspecified entry falls back to: the user's first wallet, or
  // null when they have none (wallet_id is optional in the schema). One shared
  // definition so the mount-time default AND applyFavorite's "label with no
  // wallet" reset use the exact same rule, never two copies (convention 10).
  const defaultWalletId = walletsQ.data?.[0]?.id ?? null

  // Default the wallet once wallets load, unless the user already picked one.
  useEffect(() => {
    if (walletId == null && defaultWalletId != null) setWalletId(defaultWalletId)
  }, [defaultWalletId, walletId])

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

  const hints = hintsQ.data ?? []

  // The "ใช้บ่อย" shortcut row: the most-used categories of this type, ranked by
  // history and intersected with the visible chips above — a system category
  // (stock_cogs / debt_repayment_*) that shows up in history must never surface
  // here since it isn't pickable. topCategories ranks across the full history
  // (limit = every category) so a filtered-out system category can't steal a
  // slot from a real one ranked just below it; the visible ones are then capped
  // at 4. This is a shortcut on top, NOT a reordering — the list below keeps its
  // sort_order untouched so a category never moves out from under the eye (§11.4-2).
  const frequentCategories = useMemo(() => {
    const visible = new Map(categories.map((c) => [c.id, c]))
    return topCategories(hints, type, catsQ.data?.length ?? 0)
      .map((id) => visible.get(id))
      .filter((c): c is Category => c != null)
      .slice(0, 4)
  }, [hints, type, categories, catsQ.data])

  // Hide the whole row unless it earns its space: at least 2 shortcuts, and only
  // when the full list is long enough to be worth scanning past (> 4). A short
  // list makes the shortcut just a duplicate that costs a row.
  const showFrequentRow = frequentCategories.length >= 2 && categories.length > 4

  const favorites = favQ.data ?? []

  const amount = Number(amountStr || '0')
  const reason = saveBlockedReason(amount, categoryId)
  const canSave = reason == null && !add.isPending

  const selectedCat = categories.find((c) => c.id === categoryId)
  const pendingFavName = favoriteLabel(selectedCat?.name, amount > 0 ? amount : null)

  // "Saved" is true only while the current fields still match what was last saved
  // as a label — edit any of the five and the button truthfully re-enables.
  const currentFavSig = favoriteSignature({ type, amount, categoryId, walletId, note })
  const favSaved = savedFavSig !== null && savedFavSig === currentFavSig

  function press(key: string) {
    setAmountStr((prev) => pressKey(prev, key))
  }

  function switchType(next: TransactionType) {
    setType(next)
    setCategoryId(null)
  }

  // Guess the wallet from history whenever the user picks a category — but ONLY
  // here, never in an effect that watches categoryId: applyFavorite() also sets
  // categoryId, and a guessing effect would clobber the wallet a fast-label
  // explicitly named (rule 1). If the user already picked a wallet by hand, or
  // there is no history, or the guessed wallet has since been deleted, fall back
  // to the default wallet — never null (rule 3).
  function pickCategory(id: string) {
    setCategoryId(id)
    if (!walletTouched) {
      const guess = preferredWalletFor(hints, id)
      const valid =
        guess && walletsQ.data?.some((w) => w.id === guess) ? guess : defaultWalletId
      setWalletId(valid)
    }
  }

  // Apply a fast-label — the full template of ONE entry. B13, extended to every
  // field: amount / note / wallet are each set on EVERY tap, so a label that omits
  // one CLEARS whatever the previous entry left instead of fusing with it (tap
  // "กาแฟ 60" after a stale "ค่าแท็กซี่" note → the note is gone, not silently carried
  // onto the coffee). A label with no wallet falls back to the default wallet — the
  // one explainable state — never a stale, invisible pick from the last entry.
  function applyFavorite(f: Favorite) {
    setType(f.type)
    setAmountStr(f.amount != null ? String(f.amount) : '')
    setCategoryId(f.category_id)
    setWalletId(f.wallet_id ?? defaultWalletId)
    setNote(f.note ?? '')
  }

  // Show the "saved, with undo" toast for a row that was just inserted. Shared
  // by the save button and the long-press quick-save so both gestures confirm
  // identically: one toast at a time (dismiss the previous), duration 6s, and
  // "เลิกทำ" that deletes the row and always means the latest entry. Extracted
  // per convention 10 — this toast+undo block used to live only in quickSave and
  // save() would otherwise duplicate it.
  function showSavedToast(message: string, newId: string) {
    if (lastSaveToastId.current != null) toast.dismiss(lastSaveToastId.current)
    lastSaveToastId.current = toast.show({
      kind: 'success',
      message,
      duration: 6000,
      action: {
        label: 'เลิกทำ',
        onClick: () => {
          void (async () => {
            try {
              await del.mutateAsync(newId)
              toast.success('ยกเลิกรายการแล้ว')
            } catch (e) {
              toast.error(translateError(e)) // never swallow (convention 16)
            }
          })()
        },
      },
    })
  }

  // Long-press on a fast-label: save the whole entry straight away, no trip to
  // the save button. It must land the SAME row a tap-then-save would (every
  // field mirrors applyFavorite), and it never touches the form — the user may
  // be part-way through a different entry. It also does NOT navigate away: the
  // whole point is rattling off several in a row. The home caches are already
  // warm from useAddTransaction, so the home screen is correct when reached.
  async function quickSave(f: Favorite) {
    // A label with no amount can't be saved outright — fall back to filling the
    // form (exactly like a tap) and say why, instead of banking a ฿0 entry.
    if (f.amount == null || f.amount <= 0) {
      applyFavorite(f)
      toast.show({ kind: 'info', message: 'ป้ายนี้ยังไม่ได้ตั้งยอด — ใส่ยอดแล้วกดบันทึก' })
      return
    }
    try {
      const row = await add.mutateAsync({
        type: f.type,
        amount: f.amount,
        categoryId: f.category_id,
        // Same fallback the tap path uses — one shared rule, never a copy (conv 10).
        walletId: f.wallet_id ?? defaultWalletId,
        // The date the user is looking at on the header pill, not a hardcoded
        // today: backdate the header, long-press, and the row must land on that day.
        date: dateStr,
        note: f.note,
      })
      // Confirm on the label itself for ~900ms (an overlay, not a text swap, so
      // the label keeps its width and its neighbours don't jitter).
      setJustSavedId(f.id)
      if (justSavedTimer.current != null) clearTimeout(justSavedTimer.current)
      justSavedTimer.current = setTimeout(() => setJustSavedId(null), 900)
      showSavedToast(`บันทึก “${f.label}” แล้ว`, row.id)
    } catch (e) {
      toast.error(translateError(e))
    }
  }

  async function save() {
    if (!canSave) return
    try {
      const row = await add.mutateAsync({
        type,
        amount,
        categoryId,
        walletId,
        date: dateStr,
        note: note.trim() || null,
      })
      // Stay on the page so the next receipt can be entered without walking back
      // through home → + → form. Clear only what belongs to THIS row — amount and
      // note — and keep type / category / wallet / date, since a batch of receipts
      // is usually the same category, day and wallet; clearing everything would be
      // a fresh form each time, no faster than before. Clearing the amount also
      // flips canSave false at once, so double-tapping บันทึก can't bank a
      // duplicate — a structural guard, not a timing one. Do NOT touch savedFavSig:
      // the amount change moves the signature, so favSaved falls back to false on
      // its own (PR-28). The user leaves via the back arrow, top-left.
      setAmountStr('')
      setNote('')
      showSavedToast('บันทึกรายการแล้ว', row.id)
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
      setSavedFavSig(currentFavSig)
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

  // Hardware keyboard → the same keypad. On a wide (rail) layout the amount was
  // only reachable by clicking digits one at a time; this lets a physical
  // keyboard drive the existing pressKey() reducer instead. The guards below are
  // what keep "typing a note" from silently moving the money.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // A sheet is open — even if focus isn't in a text field, keys must not
      // change the amount hidden behind it.
      if (managingCats || managingFavs) return
      // Focus is in a text field (note / date input / a field inside a sheet).
      if (isTypingTarget(e.target instanceof HTMLElement ? e.target : null)) return

      const action = keypadActionFromKey(e)
      if (!action) return

      if (action.kind === 'save') {
        // Enter while a <button> is focused (e.g. Tab'd to บันทึก) belongs to that
        // button — let its own onClick fire so we don't save twice.
        if (document.activeElement?.tagName === 'BUTTON') return
        if (!canSave) return
        e.preventDefault()
        void save()
        return
      }

      // Only swallow keys we actually consumed: a bare Backspace would otherwise
      // navigate back in some browsers.
      e.preventDefault()
      press(action.key)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [managingCats, managingFavs, canSave, save, press])

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
                แตะเติม · กดค้างบันทึกเลย
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
                <FastLabel
                  key={f.id}
                  fav={f}
                  saved={justSavedId === f.id}
                  onTap={() => applyFavorite(f)}
                  onLongPress={() => void quickSave(f)}
                />
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
          {/* aria-live so a keyboard-driven amount is announced even though nothing
              is focused; aria-label gives a clean money reading ("1,234.00 บาท")
              instead of the char-split ฿ / int / dec spans below it. */}
          <p
            aria-live="polite"
            aria-atomic="true"
            aria-label={`${ariaAmountFmt.format(amount)} บาท`}
            className="text-[40px] font-medium tracking-[-1px]"
          >
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

        {/* ใช้บ่อย — a shortcut row of the most-used categories, ABOVE the full
            list. It never reorders the list below; a tap here runs the same
            pickCategory() as a tap below, so the wallet guess comes for free. */}
        {showFrequentRow && (
          <div className="px-4 pb-2.5">
            <p className="mb-[7px] text-[11px] text-muted">ใช้บ่อย</p>
            <div className="flex flex-wrap gap-[7px]">
              {frequentCategories.map((c) => (
                <CategoryChip
                  key={c.id}
                  cat={c}
                  active={c.id === categoryId}
                  onClick={() => pickCategory(c.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* category — wraps so every category is visible at once (no hidden overflow) */}
        <div className="px-4 pb-2.5">
          <p className="mb-[7px] text-[11px] text-muted">
            {type === 'expense' ? 'หมวดรายจ่าย' : 'หมวดรายรับ'}
          </p>
          <div className="flex flex-wrap gap-[7px]">
            {categories.map((c) => (
              <CategoryChip
                key={c.id}
                cat={c}
                active={c.id === categoryId}
                onClick={() => pickCategory(c.id)}
              />
            ))}
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
                  onClick={() => {
                    setWalletId(w.id)
                    setWalletTouched(true)
                  }}
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
              หลังกรอกยอด+เลือกหมวด ครั้งหน้าแตะเพื่อเติม หรือกดค้างเพื่อบันทึกเลย
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
function FastLabel({
  fav,
  saved,
  onTap,
  onLongPress,
}: {
  fav: Favorite
  saved: boolean
  onTap: () => void
  onLongPress: () => void
}) {
  const fabric = fav.type === 'income' ? 'bg-brand-fabric-income' : 'bg-brand-fabric-stock'
  const press = useLongPress({ onTap, onLongPress })
  return (
    <button
      type="button"
      onPointerDown={press.onPointerDown}
      onPointerMove={press.onPointerMove}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onPointerLeave={press.onPointerLeave}
      onContextMenu={press.onContextMenu}
      onClick={press.onClick}
      aria-label={favoriteAria(fav.label, fav.amount)}
      // select-none: no text-selection flash on a long-press. touch-pan-x keeps
      // the row horizontally swipeable — locking the touch-action would eat the
      // swipe (see index.css for the iOS callout suppression too).
      className={`woven fast-label relative flex min-h-[46px] shrink-0 select-none touch-pan-x flex-col justify-center overflow-hidden rounded-[9px] px-3 py-1.5 text-left text-brand-thread ${fabric}`}
    >
      <span aria-hidden className="selvedge absolute inset-x-0 top-0 h-[3px]" />
      <span aria-hidden className="selvedge absolute inset-x-0 bottom-0 h-[3px]" />
      <span className="text-[15px] font-medium leading-tight tabular-nums">
        {fav.amount != null ? formatBaht(fav.amount) : 'ใส่ยอด'}
      </span>
      <span className="text-[10px] leading-tight text-brand-thread/70">{fav.label}</span>
      {/* "saved!" confirmation — overlaid on the label (never a text swap, which
          would change the label's width and jitter the row). */}
      {saved && (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-brand-deep text-white"
        >
          <IconCheck size={22} />
        </span>
      )}
    </button>
  )
}

/**
 * One selectable category chip. Shared by both the "ใช้บ่อย" shortcut row and the
 * full list so the two can never disagree about the active style or aria-pressed
 * for the same category (convention 10) — a category selected from one row shows
 * selected in the other.
 */
function CategoryChip({
  cat,
  active,
  onClick,
}: {
  cat: Category
  active: boolean
  onClick: () => void
}) {
  const Icon = categoryIcon(cat.icon)
  return (
    <button onClick={onClick} aria-pressed={active} className="flex min-h-[44px] items-center">
      <span
        className={`flex items-center gap-1 rounded-pill px-[13px] py-[7px] text-[12px] ${
          active ? 'bg-brand-tint font-medium text-brand-ink' : 'bg-fill text-muted'
        }`}
      >
        <Icon size={14} />
        {cat.name}
      </span>
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
