import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { monthBounds } from '@/lib/dates'
import type { TransactionType } from '@/lib/db'

/**
 * The four columns the entry hints are computed from — a deliberately tiny
 * payload, kept separate from `useMonthTransactions`/`MonthRow` so adding a
 * column here can never widen that query or ripple into `computeHomeSummary`'s
 * tests. The guessing lives entirely in `lib/entryHints.ts`; this hook only
 * fetches (§3: DB → lib → hooks → UI).
 */
export interface HintRow {
  type: TransactionType
  category_id: string | null
  wallet_id: string | null
  date: string
}

/**
 * Recent transactions used to guess a wallet for a category and to surface the
 * most-used categories. The window is "from the start of last month onward" via
 * the shared `monthBounds()` helper (≈30–60 days back, plenty to guess from) —
 * never a hand-rolled date (rule 17, convention 10).
 *
 * The key starts with 'transactions' so the `invalidateQueries({ queryKey:
 * ['transactions'] })` that every write already fires refreshes the guesses too
 * — no new invalidation to remember. Nothing is persisted: the guess is derived
 * from real history at query time, so every device guesses alike and behaviour
 * follows habits with no stored state to drift or clear (§11.4, cf. safeToSpend).
 */
export function useEntryHints() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['transactions', 'hints', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<HintRow[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('type, category_id, wallet_id, date')
        .gte('date', monthBounds().prevStart)
      if (error) throw error
      return data ?? []
    },
  })
}
