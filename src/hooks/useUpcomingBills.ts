import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { monthBounds } from '@/lib/dates'

/**
 * A single upcoming charge, in a source-neutral shape so the "รอจ่าย" tab can
 * accept more than one origin. v1 fills it only from `recurring`; PR-Y will add
 * friend-debt payments as `source: 'debt'` without the tab needing to change.
 */
export interface PendingItem {
  /** stable per (rule, occurrence) — a rule can fire more than once in a month */
  key: string
  /** YYYY-MM-DD the charge will land on (Asia/Bangkok) */
  date: string
  label: string
  amount: number
  /** category icon name; unknown/blank falls back via categoryIcon() */
  icon: string
  /** category colour slot 1–6, or null → neutral swatch */
  colorIndex: number | null
  /** where the row came from — recurring today; PR-Y adds 'debt' */
  source: 'recurring'
}

export interface UpcomingBills {
  items: PendingItem[]
  /** sum of every upcoming bill this month — what the SAFE sub-line deducts */
  total: number
  /** user has ≥1 active expense rule → the "รอจ่าย" tab exists (even if empty) */
  hasRules: boolean
}

/**
 * Cap on occurrences enumerated per rule. The densest sane schedule is daily
 * (≤31 in a month); past this a rule isn't advancing as expected — or
 * recurring_run_due has fallen far behind — so we surface an error rather than
 * loop. Deliberately reaches the user (rule 6: never a silent swallow).
 */
const MAX_OCCURRENCES_PER_RULE = 40

/**
 * Recurring EXPENSE charges still to hit before month-end, for the SAFE sub-line
 * and the "รอจ่าย" tab. Two rules from the domain shape this:
 *
 *  • Start from `next_run` INCLUSIVE. recurring_run_due (runs on every app load,
 *    see AppLayout) materializes every occurrence up to today and leaves next_run
 *    at the first one NOT yet charged — so occurrences already inside this month's
 *    `expense` total are always < next_run, and starting here can't double-count.
 *    We still include next_run when it's today or earlier: that means run_due
 *    hasn't processed it yet, so the money is committed but not yet recorded.
 *    (Do NOT "fix" this to begin at tomorrow — that would drop a real pending bill.)
 *
 *  • Advance ONLY via recurring_next_date (the DB's schedule arithmetic). The
 *    client never parses a schedule string — one place owns those dates (rule 3;
 *    the duplicated SKU calculator that nearly drifted is why).
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
        let d = r.next_run
        let n = 0
        while (d < b.next) {
          if (n >= MAX_OCCURRENCES_PER_RULE) {
            throw new Error(
              `คำนวณรายการรอจ่ายไม่สำเร็จ: กฎ “${r.label}” วนเกิน ${MAX_OCCURRENCES_PER_RULE} รอบ`,
            )
          }
          items.push({
            key: `${r.id}:${d}`,
            date: d,
            label: r.label,
            amount: Number(r.amount) || 0,
            icon: r.category?.icon ?? 'tag',
            colorIndex: r.category?.color_index ?? null,
            source: 'recurring',
          })
          n += 1
          const { data: nd, error: ndErr } = await supabase.rpc('recurring_next_date', {
            p_from: d,
            p_schedule: r.schedule,
          })
          if (ndErr) throw ndErr
          // null / non-advancing = a schedule the DB can't step (run_due deactivates
          // these). Stop enumerating this rule; leave the rest of the list intact.
          if (!nd || nd <= d) break
          d = nd
        }
      }

      items.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
      const total = items.reduce((s, x) => s + x.amount, 0)
      return { items, total, hasRules: rules.length > 0 }
    },
  })
}
