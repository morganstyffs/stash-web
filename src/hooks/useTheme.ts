import { useCallback, useEffect, useState } from 'react'
import { loadThemeMode, saveThemeMode, type ThemeMode } from '@/lib/theme'

/**
 * Light/dark mode. `<html>`'s `dark` class is set twice: synchronously in
 * index.html's inline script (before first paint — no flash of the wrong
 * theme), and again here whenever the user changes the setting mid-session.
 * Both read/write the same 'stash.prefs.theme' key so they can't disagree.
 */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(loadThemeMode)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', mode === 'dark')
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    saveThemeMode(next)
  }, [])

  return { mode, setMode }
}
