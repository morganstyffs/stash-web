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
