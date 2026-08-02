import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowLeft,
  IconBackspace,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
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
import { preferredWalletFor, topCategories, unusualAmountBaseline } from '@/lib/entryHints'
import { formatBaht, formatDayShort } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import { translateError } from '@/lib/errors'
import type { Category, CategoryKind, Favorite, TransactionType } from '@/lib/db'

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
 * Categories a user may pick for a brand-new manual entry of `type`: the chosen
 * kind, no stock-intake categories, and none of the system categories that only
 * ever arrive from their own flows — 'stock_cogs' (a sale's COGS leg), both
 * debt-repayment categories, and 'stock_sale_income' ('ขายสต็อก').
 *
 * stock_sale_income used to stay selectable so an off-book resale could be logged
 * by hand — reversed here: that income has no paired COGS and never lands in
 * stock_sales, so it inflates income while the STOCK PROFIT figure stays flat
 * ("ขายได้แล้วทำไมกำไรร้านไม่ขึ้น" with nothing to explain it). A resale must be
 * intake'd first, then sold on the stock screen. The category is NOT deleted —
 * stock_sale_create still needs it; it is only hidden from manual pickers. Minimal
 * structural param so tests pass a plain object (convention 11).
 */
export function isEntrySelectableCategory(
  c: { kind: CategoryKind; is_stock_category: boolean; system_key: string | null },
  type: TransactionType,
): boolean {
  return (
    c.kind === type &&
    !c.is_stock_category &&
    c.system_key !== 'stock_cogs' &&
    c.system_key !== 'stock_sale_income' &&
    c.system_key !== 'debt_repayment_income' &&
    c.system_key !== 'debt_repayment_expense'
  )
}

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

/**
 * Order the category chips so the most-used (by history) float to the head of
 * the ONE list, then the rest keep their existing order. §2.1: this REPLACES the
 * separate "ใช้บ่อย" row that duplicated categories already in the list below
 * (อาหาร appeared twice) — the very same topCategories() ranking now just sorts
 * the single list, so no category is ever shown twice. `frequentIds` is that
 * ranking, most-used first; ids not in it keep their original relative order
 * (a stable sort). Pure + deterministic so a frozen snapshot (see the component)
 * keeps chips from shuffling under the finger after every save.
 */
export function orderByFrequency<T extends { id: string }>(cats: T[], frequentIds: string[]): T[] {
  const rank = new Map(frequentIds.map((id, i) => [id, i] as const))
  return [...cats].sort((a, b) => {
    const ra = rank.get(a.id)
    const rb = rank.get(b.id)
    if (ra != null && rb != null) return ra - rb
    if (ra != null) return -1
    if (rb != null) return 1
    return 0 // both non-frequent → keep original order (Array.sort is stable)
  })
}

/**
 * Whether a `returnTo` value is a safe in-app path to navigate to. A caller
 * (e.g. the post-sale shipping nudge) hands this page where to go after save /
 * back; it must be an app-internal route only. Rejects anything that isn't a
 * string starting with a single '/' — an absolute URL ('http://…'), a
 * protocol-relative one ('//evil.example') or a bare word — so a crafted history
 * state can't turn the back button into an open redirect. Pure, exported for the
 * test.
 */
export function isInternalPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
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
  const navState = location.state as {
    prefill?: { type?: TransactionType; amount?: number; note?: string; categoryId?: string }
    returnTo?: string
  } | null
  const prefill = navState?.prefill
  // Where "back" and a successful save should land, when a flow sent us here with
  // one (e.g. ขาย → บันทึกค่าส่ง → /stock). Validated to an in-app path; anything
  // else falls back to the default behaviour (§4.2).
  const returnTo = isInternalPath(navState?.returnTo) ? navState.returnTo : null
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

  // Keypad open/closed. Expanded on entry (this page is almost always opened to
  // type a number first — opening collapsed would cost a tap every time). It
  // collapses when the user taps anywhere OUTSIDE the amount (a category / wallet
  // / note / fast-label — see the scroll area's onPointerDownCapture), and
  // re-opens by tapping the amount or the header toggle.
  const [keypadOpen, setKeypadOpen] = useState(true)

  // The pinned bottom dock (reason + save + keypad) is position:absolute so its
  // height changing never nudges the keypad. But absolute means it no longer
  // reserves space in the scroll flow, so the scroll area would hide content
  // beneath it. We MEASURE the dock's real height and feed it back as the scroll
  // area's padding-bottom — never a hardcoded guess, and it tracks the keypad
  // collapsing and the reason bar toggling automatically.
  const dockRef = useRef<HTMLDivElement | null>(null)
  const [dockHeight, setDockHeight] = useState(0)

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

  // Category chips: categories selectable for a brand-new manual entry of the
  // chosen kind (isEntrySelectableCategory — pure, unit-tested).
  const categories = useMemo(
    () => (catsQ.data ?? []).filter((c) => isEntrySelectableCategory(c, type)),
    [catsQ.data, type],
  )

  // Preselect a prefilled category once the categories load — but ONLY if it's
  // actually selectable for this entry (in the filtered `categories` above, the
  // same source the chips use). A stale id (the category was deleted between the
  // nudge and here) is silently ignored rather than set to a value that wouldn't
  // highlight any chip and couldn't be un-picked (§4.1). Applied once via the ref
  // so it can't clobber a choice the user makes afterwards.
  const prefillCategoryId = prefill?.categoryId ?? null
  const prefillCatApplied = useRef(false)
  useEffect(() => {
    if (prefillCatApplied.current || prefillCategoryId == null) return
    if (catsQ.data == null) return // wait for the categories to load
    prefillCatApplied.current = true
    if (categories.some((c) => c.id === prefillCategoryId)) setCategoryId(prefillCategoryId)
  }, [catsQ.data, categories, prefillCategoryId])

  const hints = hintsQ.data ?? []

  // §2.1: the most-used categories, by history, now sort the ONE list instead of
  // living in a separate "ใช้บ่อย" row that duplicated them (อาหาร showed twice).
  // topCategories() is the SAME ranking that row used (limit = the full list, so
  // a filtered-out system category can't take a real one's slot); orderByFrequency
  // floats those to the head and leaves the rest in sort_order.
  //
  // FROZEN per type for the session: `hints` refetches after every save (its key
  // starts with 'transactions'), so ranking off the live data would let a chip
  // jump position the instant you save one — moving the next tap out from under
  // the finger. We snapshot the ranking the first time there's history for a type
  // and reuse it; a fresh page visit (remount) picks up the newer habits.
  const frozenFreqRef = useRef<Partial<Record<TransactionType, string[]>>>({})
  const frequentIds = useMemo(() => {
    const frozen = frozenFreqRef.current[type]
    if (frozen) return frozen
    const ids = topCategories(hints, type, catsQ.data?.length ?? 0)
    if (ids.length > 0) frozenFreqRef.current[type] = ids // only freeze real history
    return ids
  }, [type, hints, catsQ.data])

  const orderedCategories = useMemo(
    () => orderByFrequency(categories, frequentIds),
    [categories, frequentIds],
  )

  const favorites = favQ.data ?? []

  const amount = Number(amountStr || '0')
  const reason = saveBlockedReason(amount, categoryId)
  const canSave = reason == null && !add.isPending

  // A gentle "did you add a zero?" nudge — the typical (median) amount for this
  // category when the entry is ≥10× it, else null. Derived from the same `hints`
  // already loaded for the wallet/category guesses; it only WARNS, never gates
  // canSave/save (§2 of PR-35). Recomputes as the keypad drives `amount`.
  const unusualBaseline = unusualAmountBaseline(hints, categoryId, type, amount)

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
      // Build the message BEFORE clearing the form, so a later reorder can't
      // turn it into "บันทึก ฿0 แล้ว". Since save() can only fire once per row
      // and toasts show one at a time (a new save dismisses the last), the amount
      // is the one thing that tells a rapid batch of receipts apart — the tap
      // path (:418) already names its label, so the manual path should too.
      const savedMessage = `บันทึก ${formatBaht(amount)} แล้ว`
      // Sent here by a flow that wants us back somewhere on save (ขาย → บันทึกค่าส่ง
      // → /stock): go there instead of staying, so the user isn't left on the add
      // screen unsure whether the flow finished (§4.2). No form-clearing needed —
      // the page unmounts. Without returnTo, keep the batch-entry behaviour: stay,
      // clear only amount + note.
      if (returnTo) {
        showSavedToast(savedMessage, row.id)
        navigate(returnTo)
        return
      }
      setAmountStr('')
      setNote('')
      showSavedToast(savedMessage, row.id)
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

  // Measure the dock so the scroll area reserves exactly its height (§ padding-
  // bottom "วัดจากของจริง"). A ResizeObserver catches every height change — the
  // keypad collapsing, the reason bar appearing/disappearing, the font loading,
  // the safe-area inset resolving — with no hardcoded number. Re-run on keypadOpen
  // so the fallback measure() also fires where ResizeObserver is absent (jsdom).
  useLayoutEffect(() => {
    const el = dockRef.current
    if (!el) return
    const measure = () => setDockHeight(el.offsetHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [keypadOpen])

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
    <div className="relative mx-auto flex h-full max-w-md flex-col overflow-hidden bg-white">
      {/* header — pinned */}
      <div className="flex shrink-0 items-center justify-between px-[18px] pb-3 pt-4">
        <button aria-label="ย้อนกลับ" onClick={() => navigate(returnTo ?? '/')}>
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

      {/* amount + type — PINNED (shrink-0), so §3's "ยอด · จ่าย/รับ ห้ามถูกบัง":
          they never scroll away and are never under the keypad. */}
      <div className="shrink-0">
        {/* จ่าย / รับ */}
        <div className="flex justify-center gap-1.5 pb-1.5 pt-0.5">
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

        {/* amount + 000 / ล้าง (stacked to the right, number stays centred).
            The amount is a button: tapping it re-opens a collapsed keypad
            (§ "แตะที่ตัวเลขยอดเพื่อกางกลับ"). */}
        <div className="relative px-4 pb-2 pt-0.5 text-center">
          {/* Amount for the EYE — the digit spans are aria-hidden (they read aloud
              as gibberish, ฿ / int / dec); the button's aria-label names the
              control and the sr-only live region below speaks the value. */}
          <button
            type="button"
            onClick={() => setKeypadOpen(true)}
            aria-label="ยอดเงิน — แตะเพื่อแสดงแป้นตัวเลข"
            className="mx-auto block max-w-full"
          >
            <span aria-hidden="true" className="text-[40px] font-medium tracking-[-1px]">
              <span className="text-[26px] text-muted">฿</span>
              {intDisplay}
              <span className="text-muted">{decSuffix}</span>
            </span>
          </button>
          {/* Amount for the EAR — a real live region that reads as one money
              value. Needed because typing from the keyboard (PR-29) focuses
              nothing, so the screen reader stays silent without this. */}
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {`${ariaAmountFmt.format(amount)} บาท`}
          </span>
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
      </div>

      {/* scroll area — everything the keypad is NOT allowed to hide. padding-
          bottom = the measured dock height so nothing ends up underneath it and
          unreachable (§2). A pointer-down anywhere here (a category / wallet /
          note / fast-label — i.e. OUTSIDE the amount) collapses the keypad. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ paddingBottom: dockHeight }}
        onPointerDownCapture={() => setKeypadOpen(false)}
      >
        {/* unusually-high-amount nudge — icon + text (never colour alone, B14),
            same warn tone as the can't-save reason bar, role="status" so a
            screen reader announces it. It only warns; save stays enabled. */}
        {unusualBaseline != null && (
          <div className="px-4 pb-2.5 pt-1">
            <div
              role="status"
              className="flex items-center gap-1.5 rounded-input bg-warn-bg px-3 py-2 text-[12px] font-medium text-warn-ink"
            >
              <IconAlertTriangle size={15} className="shrink-0" />
              <span>
                หมวดนี้ปกติราว {formatBaht(unusualBaseline)} — ยอดนี้สูงกว่ามาก ตรวจสอบอีกครั้ง
              </span>
            </div>
          </div>
        )}

        {/* fast-labels (favorites) — the fastest path to a saved entry. Hidden
            entirely until the user has some, so it never wastes space. */}
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

        {/* category — ONE list (§2.1: the old duplicate "ใช้บ่อย" row is gone).
            orderedCategories floats the most-used to the head; wraps so every
            category is visible at once (no hidden overflow). */}
        <div className="px-4 pb-2.5">
          <p className="mb-[7px] text-[11px] text-muted">
            {type === 'expense' ? 'หมวดรายจ่าย' : 'หมวดรายรับ'}
          </p>
          {/* gap-2 (8px), a touch more air than the old 7px: it buys back the
              separation the smaller chips give up (§2.2 — these chips sit below
              the 44px min the bottom-nav guard enforces, a deliberate call for a
              dense secondary picker, compensated here by the gap). */}
          <div className="flex flex-wrap gap-2">
            {orderedCategories.map((c) => (
              <CategoryChip
                key={c.id}
                cat={c}
                active={c.id === categoryId}
                onClick={() => pickCategory(c.id)}
              />
            ))}
            {/* + เพิ่มหมวด — §2.3: NOT a category, so it's set apart with a dashed
                outline and left at the very end, instead of hiding among the real
                filled chips where the eye had to read past it every time. */}
            <button
              type="button"
              onClick={() => setManagingCats(true)}
              className="flex min-h-[40px] shrink-0 items-center"
            >
              <span className="flex items-center gap-1 rounded-pill border border-dashed border-chevron px-3 py-1.5 text-[11.5px] text-faint">
                <IconPlus size={13} />
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

      {/* dock — reason + save + keypad, pinned to the viewport bottom with
          position:absolute. Because it is bottom-anchored, its height changing
          (the reason bar toggling, the keypad collapsing) grows/shrinks it
          UPWARD — the keypad and the save button never move a pixel (the old
          bug: the reason bar sat between the keypad and save in a bottom-pinned
          flex block, so losing it dragged the keypad DOWN 42px). Measured into
          dockHeight → the scroll area's padding-bottom. */}
      <div
        ref={dockRef}
        className="absolute inset-x-0 bottom-0 bg-white pb-[max(8px,env(safe-area-inset-bottom))]"
      >
        {/* why-you-can't-save bar — ABOVE the save button, icon + text (never
            colour alone); role=status so a screen reader announces it. */}
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

        {/* save — always visible, ABOVE the keypad (never flows under it, §3) */}
        <div className="px-4 pt-1">
          <button
            onClick={save}
            disabled={!canSave}
            className="flex w-full items-center justify-center gap-1 rounded-btn bg-brand-deep py-3.5 text-[15px] font-medium text-white disabled:opacity-40"
          >
            <IconCheck size={17} />
            {add.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>

        {/* keypad — collapsible. The header bar always shows and carries the
            explicit collapse/expand toggle; only the grid comes and goes. When
            collapsed the grid's height leaves the dock, so the measured padding-
            bottom shrinks and the scroll area reclaims the room (§ "คืน padding
            ให้ถูก"). */}
        <div className="pt-2">
          <div className="flex items-center justify-between px-4 pb-1">
            <span className="text-[11px] text-muted">แป้นตัวเลข</span>
            <button
              type="button"
              onClick={() => setKeypadOpen((v) => !v)}
              aria-expanded={keypadOpen}
              aria-label={keypadOpen ? 'ยุบแป้นตัวเลข' : 'แสดงแป้นตัวเลข'}
              className="flex items-center gap-0.5 text-[11px] font-medium text-brand-deep"
            >
              {keypadOpen ? 'ยุบ' : 'แสดง'}
              {keypadOpen ? <IconChevronDown size={15} /> : <IconChevronUp size={15} />}
            </button>
          </div>
          {keypadOpen && (
            <div className="grid grid-cols-3 px-3 pb-1 text-center">
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
          )}
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
  // §2.2: shrunk from ~52px → ~40px — smaller icon (14→13), smaller text
  // (12→11.5), tighter padding (py-7→py-1.5), and the 44px touch-target min
  // dropped to 40. That 40 is BELOW the 44×44 the bottom-nav guard enforces —
  // a deliberate trade for a dense secondary picker that can run to a dozen
  // long Thai names ("ค่าส่งที่เก็บจากลูกค้า"), NOT applied silently: the row's
  // gap-2 (up from 7px) restores finger separation, and the full name is kept
  // (never truncated to an icon grid) so a chip stays recognisable.
  return (
    <button onClick={onClick} aria-pressed={active} className="flex min-h-[40px] items-center">
      <span
        className={`flex items-center gap-1 rounded-pill px-3 py-1.5 text-[11.5px] ${
          active ? 'bg-brand-tint font-medium text-brand-ink' : 'bg-fill text-muted'
        }`}
      >
        <Icon size={13} />
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
