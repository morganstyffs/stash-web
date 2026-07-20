/**
 * Local-only user preferences (no server round-trip yet). The AI assistant is
 * not wired up in this slice — these toggles just persist the user's choice so
 * the setting sticks, per the brief ("เก็บ preference ไว้ก่อน").
 */
export interface AiPrefs {
  assistant: boolean
  autoCategory: boolean
}

const KEY = 'stash.prefs.ai'
const DEFAULTS: AiPrefs = { assistant: true, autoCategory: true }

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
