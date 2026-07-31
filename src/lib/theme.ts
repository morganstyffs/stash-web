/**
 * Theme mode persistence — DELIBERATELY separate from lib/prefs.ts.
 *
 * Every other 'stash.*' preference lives in prefs.ts (one place owns the keys).
 * Theme is the intentional exception: it has to be read synchronously, before
 * React hydrates, so the correct light/dark class is on <html> from the first
 * paint and the screen doesn't flash the wrong mode. Folding it into prefs.ts
 * (loaded through the React tree) would reintroduce that flash. Keep the direct
 * localStorage access here — do NOT move it into prefs.ts.
 */
export type ThemeMode = 'light' | 'dark'

const KEY = 'stash.prefs.theme'
const DEFAULT: ThemeMode = 'light'

export function loadThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed === 'light' || parsed === 'dark' ? parsed : DEFAULT
  } catch {
    return DEFAULT
  }
}

export function saveThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(mode))
  } catch {
    /* quota / private-mode — ignore, same convention as prefs.ts */
  }
}
