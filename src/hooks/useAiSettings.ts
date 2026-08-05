import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { AiSettings } from '@/lib/db'

/**
 * The user's AI-consent state, as the THREE values the settings screen needs to
 * tell apart — deliberately not a bare boolean, so the UI can distinguish "never
 * chosen" from "turned off" (design §3.5.1, a distinction that comes for free
 * from the "no row" model):
 *
 *   • 'never_chosen' — no row yet: the opt-in has never been answered. Behaves
 *     exactly like consent=false, but the UI shows the full explanation for the
 *     first time.
 *   • 'off'          — a row with consent=false: the user turned it off. No need
 *     to repeat the full pitch.
 *   • 'on'           — a row with consent=true.
 *
 * The server is the only source of truth (design §3.5): a client flag can't be
 * trusted, same principle as never trusting user_id from a request body. The old
 * localStorage AI-consent flag (once `stash.prefs.ai.assistant`) has been removed
 * entirely; consent is server-only.
 */
export type ConsentState = 'never_chosen' | 'off' | 'on'

/**
 * Read the caller's own consent row (0029). Uses `.maybeSingle()` so a MISSING
 * row resolves to `data = null` WITHOUT an error — "no row" is "never chosen",
 * not a failure (design §3.5.1). RLS scopes SELECT to the owner and `user_id` is
 * the primary key, so there is at most one visible row.
 */
export function useConsent() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['ai_settings', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ConsentState> => {
      const { data, error } = await supabase
        .from('ai_settings')
        .select('consent')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      // No row = never chosen (NOT an error). Same fail-closed meaning as
      // consent=false, but a distinct UI state.
      if (data == null) return 'never_chosen'
      return data.consent ? 'on' : 'off'
    },
  })
}

/**
 * Turn consent on or off. Upsert (not insert) because the row may not exist yet;
 * the conflict target is the `user_id` primary key.
 *
 * We deliberately DON'T send `user_id`: the column defaults to `auth.uid()` (see
 * the 0029 header), so the server stamps the owner and the client can't spoof it
 * — the same principle as never trusting `user_id` from a request body.
 *
 * Turning consent off is `consent = false`, NEVER a row delete: there is no
 * DELETE policy and that's intentional (0029) — deleting would revert to the
 * "never chosen" state and re-show the first-time explanation.
 *
 * Not optimistic: `onSuccess` returns the invalidation promise, so `mutateAsync`
 * resolves only after the row is written AND the query has refetched. The caller
 * awaits this before the UI reflects the new state (same as AddPage /
 * WalletTransferSheet). This switch controls whether financial data leaves the
 * app for a third party, so the UI must never show "on" while the server hasn't
 * recorded it; on failure nothing local changed, so the toggle (bound to the
 * server state) stays on its real value.
 */
export function useSetConsent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (consent: boolean) => {
      // Typed against the generated schema: only `consent` is sent, user_id is
      // filled by the column default. A wrong column name here is a compile error.
      const row: Pick<AiSettings, 'consent'> = { consent }
      const { error } = await supabase
        .from('ai_settings')
        .upsert(row, { onConflict: 'user_id' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai_settings'] }),
  })
}
