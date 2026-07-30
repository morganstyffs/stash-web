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
