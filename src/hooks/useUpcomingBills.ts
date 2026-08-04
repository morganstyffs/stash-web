import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { monthBounds } from '@/lib/dates'
import {
  collectMonthOccurrences,
  type PendingItem,
  type UpcomingBills,
} from '@/lib/upcomingBills'

/**
 * Recurring EXPENSE charges still to hit this month, for the SAFE sub-line and the
 * "รอจ่าย" tab. See collectMonthOccurrences for the window rules.
 */
export function useUpcomingBills() {
  const { user } = useAuth()
  const b = monthBounds()
  return useQuery({
    // keyed under 'recurring' so useRunRecurringOnLoad's invalidate refreshes this
    // once due occurrences are materialized and next_run is advanced.
    queryKey: ['recurring', 'upcoming', user?.id, b.key],
    enabled: !!user,
    queryFn: async (): Promise<UpcomingBills> => {
      const { data, error } = await supabase
        .from('recurring')
        .select('id, label, amount, schedule, next_run, category:categories(icon, color_index)')
        .eq('active', true)
        .eq('type', 'expense')
      if (error) throw error
      const rules = data ?? []

      const items: PendingItem[] = []
      for (const r of rules) {
        if (!r.next_run) continue
        const dates = await collectMonthOccurrences(r.next_run, b, async (from) => {
          const { data: nd, error: ndErr } = await supabase.rpc('recurring_next_date', {
            p_from: from,
            p_schedule: r.schedule,
          })
          if (ndErr) throw ndErr
          return nd
        })
        for (const d of dates) {
          items.push({
            key: `${r.id}:${d}`,
            date: d,
            label: r.label,
            amount: Number(r.amount) || 0,
            icon: r.category?.icon ?? 'tag',
            colorIndex: r.category?.color_index ?? null,
            source: 'recurring',
          })
        }
      }

      items.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
      const total = items.reduce((s, x) => s + x.amount, 0)
      return { items, total, hasRules: rules.length > 0 }
    },
  })
}
