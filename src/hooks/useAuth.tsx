import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthError, Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { clearChatHistory } from '@/lib/prefs'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  /** True only after a PASSWORD_RECOVERY event (arrived via a reset link). Gates
   *  the reset-password form so a normal session can't change the password. */
  isRecovery: boolean
  /** Clears the recovery flag once the reset flow is done (or abandoned). */
  clearRecovery: () => void
  signInWithPassword: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signUpWithPassword: (email: string, password: string) => Promise<{ error: AuthError | null }>
  /** Sends the reset-password email. Redirects back to /reset-password. */
  resetPasswordForEmail: (email: string) => Promise<{ error: AuthError | null }>
  /** Sets a new password for the currently-authenticated (recovery) session. */
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isRecovery, setIsRecovery] = useState(false)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session)
      })
      .catch(() => {
        // Can't reach Supabase (offline / paused project). Don't hang on the
        // splash forever — fall through as signed-out so the login screen shows
        // and the user gets a real error when they try to sign in.
        setSession(null)
      })
      .finally(() => {
        setLoading(false)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Fired when the reset-link's URL fragment is exchanged for a session.
      // detectSessionInUrl also strips the token from the address bar here.
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true)
      setSession(next)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isRecovery,
      clearRecovery: () => setIsRecovery(false),
      async signInWithPassword(email, password) {
        // Return the full AuthError (not just its message) so translateError can
        // read `code` / `status` / `name` and tell apart wrong-password vs.
        // unverified-email vs. can't-reach-Supabase (paused project / offline).
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return { error }
      },
      async signUpWithPassword(email, password) {
        const { error } = await supabase.auth.signUp({ email, password })
        return { error }
      },
      async resetPasswordForEmail(email) {
        // The recovery link lands the user on /reset-password, where the URL
        // fragment is exchanged for a temporary session (detectSessionInUrl).
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        return { error }
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password })
        return { error }
      },
      async signOut() {
        // Wipe the saved AI transcript BEFORE the session ends. Every account is
        // created by the owner and can share one device, so a lingering transcript
        // would show the next person to sign in the previous one's financial
        // conversation. This is the single sign-out path in the app, so it's the one
        // place this must happen (task 7).
        clearChatHistory()
        await supabase.auth.signOut()
      },
    }),
    [session, loading, isRecovery],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
