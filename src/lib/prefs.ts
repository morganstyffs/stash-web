import type { ChatTurn } from '@/lib/aiChat'

/**
 * Local-only UI preferences.
 *
 * `autoCategory` is a still-local placeholder — a feature that guesses a category
 * while typing (§5), unrelated to the AI chat.
 *
 * The AI-consent toggle is deliberately NOT here: consent lives server-side (the
 * ai_settings table, read/written via useAiSettings) because the server is the
 * only source that can be trusted — a client flag is no more trustworthy than a
 * user_id from a request body (§3.5).
 */
export interface AiPrefs {
  autoCategory: boolean
}

const KEY = 'stash.prefs.ai'
const DEFAULTS: AiPrefs = { autoCategory: true }

export function loadAiPrefs(): AiPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function saveAiPrefs(prefs: AiPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

// ── hide-balance toggle ──────────────────────────────────────────────────────
// The eye on the hero. Kept here so components never touch localStorage directly
// (one place owns every 'stash.*' key). Stored as '1'/'0' — unchanged wire
// format so no migration from the previous inline HomePage code.
const HIDE_BALANCE_KEY = 'stash.hideBalance'

export function loadHideBalance(): boolean {
  try {
    return localStorage.getItem(HIDE_BALANCE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveHideBalance(hidden: boolean): void {
  try {
    localStorage.setItem(HIDE_BALANCE_KEY, hidden ? '1' : '0')
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

// ── stock page view (rack / list) ────────────────────────────────────────────
// Which layout the คลังสินค้า page last used. Kept here — not inline in
// StockPage — so every 'stash.*' key lives in one file (same reason as the eye
// toggle above). Stored as the raw 'rack'/'list' word, unchanged wire format so
// there's no migration from the previous inline StockPage code.
export type StockView = 'rack' | 'list'

const STOCK_VIEW_KEY = 'stash.stockView'
const STOCK_VIEW_DEFAULT: StockView = 'rack'

export function loadStockView(): StockView {
  try {
    return localStorage.getItem(STOCK_VIEW_KEY) === 'list' ? 'list' : 'rack'
  } catch {
    return STOCK_VIEW_DEFAULT
  }
}

export function saveStockView(view: StockView): void {
  try {
    localStorage.setItem(STOCK_VIEW_KEY, view)
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

// ── home "moments" (new month / first sale) ──────────────────────────────────
// The last home state we recorded, so we can play a one-off animation when it
// changes (see useHomeMoments). Device-local by design — see STASH_CONTEXT §
// "หน้าแรก" notes: syncing this to the DB isn't worth it for a handful of users,
// so opening a phone then a laptop can replay a moment once. `month` is null
// until the first record, which is how we avoid celebrating for a brand-new user.
export interface HomeMomentState {
  /** month key 'YYYY-MM' last seen, or null before anything was recorded */
  month: string | null
  /** whether STOCK PROFIT was non-zero when last recorded */
  stockActive: boolean
}

const HOME_MOMENTS_KEY = 'stash.home.moments'
const HOME_MOMENTS_DEFAULT: HomeMomentState = { month: null, stockActive: false }

export function loadHomeMoments(): HomeMomentState {
  try {
    const raw = localStorage.getItem(HOME_MOMENTS_KEY)
    return raw ? { ...HOME_MOMENTS_DEFAULT, ...JSON.parse(raw) } : HOME_MOMENTS_DEFAULT
  } catch {
    return HOME_MOMENTS_DEFAULT
  }
}

export function saveHomeMoments(state: HomeMomentState): void {
  try {
    localStorage.setItem(HOME_MOMENTS_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

// ── AI chat history ───────────────────────────────────────────────────────────
// The ผู้ช่วย AI transcript, kept so a page reload — or a PWA memory-reclaim on a
// phone — doesn't wipe a conversation the user was in the middle of (task 7). Kept
// here for the same reason as the toggles above: one file owns every 'stash.*' key,
// components never touch localStorage directly.
//
// DELIBERATELY localStorage, NOT the DB. Chat history is a convenience, not a
// security mechanism — unlike consent (`ai_settings`), which must live server-side
// because a client flag is no more trustworthy than a user_id from a request body.
// Persisting to the DB would mean a new table + RLS + the user's financial questions
// resting on a server forever, bought only to read the chat across devices — which
// this user group barely wants. Not worth it; no migration belongs to this feature.
//
// We store ONLY `{ role, text }` — byte-identical to `ChatTurn`, the shape already
// allowed to leave the client on the wire. Nothing else is kept: a field later added
// to the page's own message type (e.g. a deep-link payload) must not leak onto disk,
// exactly as it must not leak onto the wire.
const CHAT_HISTORY_KEY = 'stash.ai.chat'

// localStorage is small (a few MB) and a long transcript buys nothing — the Worker
// only ever receives a bounded tail of history anyway. So cap the stored turn count
// and, when a save would exceed it, drop the OLDEST first so the newest conversation
// always survives. A named constant with this note, never a bare number inline.
// Exported so the test asserts the exact cap instead of hard-coding the number.
export const CHAT_HISTORY_MAX = 100

/** A single stored turn is a valid `ChatTurn` only if it's an object with a known
 *  role and a string text. Anything else (null, array, number, wrong role, missing
 *  text) is rejected so a corrupt element can't reach the UI as a broken bubble. */
function isChatTurn(v: unknown): v is ChatTurn {
  if (!v || typeof v !== 'object') return false
  const t = v as Record<string, unknown>
  return (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string'
}

/**
 * Read the saved transcript. Resilient BY CONTRACT: absent key, broken JSON, a
 * non-array, or any wrong-shaped element all collapse to `[]` and this NEVER throws.
 * A user must never be unable to open the app because a stored transcript went bad —
 * an empty chat is the accepted failure. Only `{ role, text }` is carried back
 * (extra keys on a stored object are dropped), so what's read is exactly the wire
 * shape, and one bad element doesn't discard the good ones around it.
 */
export function loadChatHistory(): ChatTurn[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isChatTurn).map(({ role, text }) => ({ role, text }))
  } catch {
    return []
  }
}

/**
 * Persist the transcript, keeping only the newest `CHAT_HISTORY_MAX` turns (older
 * ones are dropped). Writes ONLY `{ role, text }`, so a field added to the caller's
 * message type can't ride along onto disk. Swallows quota / privacy-mode errors like
 * every other writer here — a failure to save history must never surface as an error.
 */
export function saveChatHistory(history: ChatTurn[]): void {
  try {
    const tail = history.slice(-CHAT_HISTORY_MAX).map(({ role, text }) => ({ role, text }))
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(tail))
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/**
 * Wipe the saved transcript. Called from the visible clear button, on sign-out, and
 * when consent is turned off — every place the stored financial conversation must
 * not outlive the reason it was allowed to be kept.
 */
export function clearChatHistory(): void {
  try {
    localStorage.removeItem(CHAT_HISTORY_KEY)
  } catch {
    /* ignore privacy-mode errors */
  }
}
